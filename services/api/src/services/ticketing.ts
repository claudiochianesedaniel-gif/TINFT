import {
  type Account,
  type AccountRole,
  type Club,
  DomainError,
  type Event,
  type EventStatus,
  type EventType,
  NotFound,
  type Order,
  type Ticket,
  type Tier,
  type Transfer,
  type TransferMode,
  type Validation,
  type ValidationOutcome,
  type Validator
} from "../domain/models";
import type {Store} from "../repo/store";
import {
  canAcquireForEvent,
  exitFeeCents,
  GOODWILL_PER_TICKET,
  isResalePriceAllowed,
  MAX_PER_EVENT,
  orderTotalCents,
  resaleCapCents,
  royaltyCents,
  royaltySplitCents
} from "../domain/rules";
import {FakeSpid, type IdentityVerifier} from "../identity/verifier";
import {hashPassword} from "../auth/password";
import {verifyAccessToken} from "../access/access-token";
import type {ChainPort} from "../chain/port";
import {FakeChain} from "../chain/fake";

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Servizio applicativo TINFT: orchestra i flussi dei 4 profili applicando le
 * regole economiche (rules.ts), le stesse enforced on-chain dai contratti M1–M5.
 * Dipende dall'interfaccia {@link Store} (in-memory o Postgres/Prisma): ogni
 * mutazione di un'entità è persistita esplicitamente via `store.update*`.
 */
export class TicketingService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number = nowSeconds,
    private readonly verifier: IdentityVerifier = new FakeSpid(),
    private readonly chain: ChainPort = new FakeChain()
  ) {}

  // -------------------------------------------------------------- account
  async createAccount(input: {
    role?: AccountRole;
    nome: string;
    cognome: string;
    email: string;
    cf?: string;
    cfHash?: string;
    dateOfBirth?: string;
    placeOfBirth?: string;
    gender?: string;
    address?: string;
    city?: string;
    zip?: string;
    province?: string;
    phone?: string;
    walletAddress?: string;
    passwordHash?: string;
  }): Promise<Account> {
    const role = input.role ?? "CLIENTE";
    const account: Account = {
      id: this.store.id("acc"),
      role,
      // KYC solo per gli organizzatori: parte da NONE (deve essere verificato per pubblicare)
      kycStatus: role === "ORGANIZER" ? "NONE" : undefined,
      nome: input.nome,
      cognome: input.cognome,
      email: input.email,
      cf: input.cf,
      cfHash: input.cfHash,
      dateOfBirth: input.dateOfBirth,
      placeOfBirth: input.placeOfBirth,
      gender: input.gender,
      address: input.address,
      city: input.city,
      zip: input.zip,
      province: input.province,
      phone: input.phone,
      verified: !!input.cfHash,
      walletAddress: input.walletAddress,
      goodwill: 0,
      passwordHash: input.passwordHash
    };
    await this.store.createAccount(account);
    return account;
  }

  /** Cerca un account per email (case-insensitive). Per il login. */
  async findAccountByEmail(email: string): Promise<Account | undefined> {
    return this.store.getAccountByEmail(email);
  }

  // --------------------------------------------- registrazione email + OTP (v2)
  /** Avvia la registrazione via email: genera un codice OTP a 6 cifre e tiene il dato in attesa. */
  async startEmailRegistration(input: {
    nome: string;
    cognome: string;
    cf: string;
    email: string;
    dateOfBirth?: string;
    placeOfBirth?: string;
    gender?: string;
    address?: string;
    city?: string;
    zip?: string;
    province?: string;
    phone?: string;
    username?: string;
    password?: string;
  }): Promise<{email: string; devCode: string}> {
    if (!input.email?.trim()) throw new DomainError("INVALID_EMAIL", "email obbligatoria");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.store.setPendingRegistration({
      email: input.email,
      code,
      nome: input.nome,
      cognome: input.cognome,
      cf: input.cf,
      dateOfBirth: input.dateOfBirth,
      placeOfBirth: input.placeOfBirth,
      gender: input.gender,
      address: input.address,
      city: input.city,
      zip: input.zip,
      province: input.province,
      phone: input.phone,
      username: input.username,
      passwordHash: input.password ? hashPassword(input.password) : undefined,
      createdAt: this.now()
    });
    return {email: input.email, devCode: code};
  }

  /** Verifica l'OTP: se corretto crea un account CLIENTE verificato (hash CF) e ripulisce il pending. */
  async verifyEmailRegistration(email: string, code: string): Promise<Account> {
    const pending = await this.store.getPendingRegistration(email);
    if (!pending || pending.code !== code) throw new DomainError("BAD_CODE", "codice errato o scaduto", 400);
    const identity = this.verifier.verify({cf: pending.cf, nome: pending.nome, cognome: pending.cognome});
    const account = await this.createAccount({
      role: "CLIENTE",
      nome: pending.nome,
      cognome: pending.cognome,
      email: pending.email,
      cf: pending.cf,
      cfHash: identity.cfHash,
      dateOfBirth: pending.dateOfBirth,
      placeOfBirth: pending.placeOfBirth,
      gender: pending.gender,
      address: pending.address,
      city: pending.city,
      zip: pending.zip,
      province: pending.province,
      phone: pending.phone,
      passwordHash: pending.passwordHash
    });
    await this.store.deletePendingRegistration(email);
    return account;
  }

  /** GDPR — diritto alla cancellazione: elimina l'account e i suoi biglietti (dati collegati). */
  async deleteAccount(id: string): Promise<{deleted: string; tickets: number}> {
    if (!(await this.store.getAccount(id))) throw NotFound("account");
    const owned = await this.store.ticketsByOwner(id);
    let removed = 0;
    for (const t of owned) {
      await this.store.deleteTicket(t.id);
      removed++;
    }
    await this.store.deleteAccount(id);
    return {deleted: id, tickets: removed};
  }

  // -------------------------------------------------------------- eventi
  async createEvent(input: {
    organizerId: string;
    clubId?: string;
    title: string;
    venue: string;
    date: string;
    type?: EventType;
    priceCents: number;
    capacity: number;
    status?: EventStatus;
  }): Promise<Event> {
    await this.getAccount(input.organizerId);
    if (input.priceCents < 0 || input.capacity <= 0) {
      throw new DomainError("INVALID_EVENT", "prezzo o capienza non validi");
    }
    const event: Event = {
      id: this.store.id("evt"),
      organizerId: input.organizerId,
      clubId: input.clubId,
      title: input.title,
      venue: input.venue,
      date: input.date,
      type: input.type ?? "TICKET_NFT",
      priceCents: input.priceCents,
      capacity: input.capacity,
      sold: 0,
      status: input.status ?? "ON_SALE"
    };
    await this.store.createEvent(event);
    return event;
  }

  async listEvents(): Promise<Event[]> {
    return this.store.listEvents();
  }

  async getEvent(id: string): Promise<Event> {
    const e = await this.store.getEvent(id);
    if (!e) throw NotFound("evento");
    return e;
  }

  // ----------------------------------------------- KYC organizzatore (B7)
  /** L'organizzatore invia il KYC: da NONE/REJECTED passa a PENDING. */
  async submitKyc(organizerId: string): Promise<Account> {
    const org = await this.getAccount(organizerId);
    if (org.role !== "ORGANIZER") throw new DomainError("NOT_ORGANIZER", "non è un organizzatore", 409);
    const status = org.kycStatus ?? "NONE";
    if (status !== "NONE" && status !== "REJECTED") {
      throw new DomainError("KYC_STATE", `KYC non inviabile dallo stato ${status}`, 409);
    }
    org.kycStatus = "PENDING";
    await this.store.updateAccount(org);
    return org;
  }

  /** Decisione admin sul KYC: VERIFIED o REJECTED (il gating del token è in server.ts). */
  async decideKyc(organizerId: string, decision: "VERIFIED" | "REJECTED"): Promise<Account> {
    const org = await this.getAccount(organizerId);
    if (org.role !== "ORGANIZER") throw new DomainError("NOT_ORGANIZER", "non è un organizzatore", 409);
    if (decision !== "VERIFIED" && decision !== "REJECTED") {
      throw new DomainError("INVALID_DECISION", "decisione non valida", 400);
    }
    org.kycStatus = decision;
    await this.store.updateAccount(org);
    return org;
  }

  /** Pubblica un evento DRAFT → ON_SALE; solo l'organizzatore proprietario e con KYC verificato. */
  async publishEvent(eventId: string, organizerId: string): Promise<Event> {
    const event = await this.getEvent(eventId);
    if (event.organizerId !== organizerId) throw new DomainError("NOT_OWNER", "non sei l'organizzatore dell'evento", 403);
    const org = await this.getAccount(organizerId);
    if ((org.kycStatus ?? "NONE") !== "VERIFIED") {
      throw new DomainError("KYC_REQUIRED", "KYC organizzatore non verificato", 403);
    }
    if (event.status === "ON_SALE") return event; // idempotente
    if (event.status !== "DRAFT") throw new DomainError("NOT_DRAFT", "evento non in bozza", 409);
    event.status = "ON_SALE";
    await this.store.updateEvent(event);
    return event;
  }

  // ------------------------------------------------ varchi / validatori (B6)
  /** Crea un varco (gate) per l'evento; solo l'organizzatore proprietario. */
  async createValidator(eventId: string, organizerId: string): Promise<Validator> {
    const event = await this.getEvent(eventId);
    if (event.organizerId !== organizerId) throw new DomainError("NOT_OWNER", "non sei l'organizzatore dell'evento", 403);
    const code = "VARCO-" + Math.floor(1000 + Math.random() * 9000);
    const validator: Validator = {
      id: this.store.id("gate"),
      eventId: event.id,
      code,
      createdAt: this.now()
    };
    await this.store.createValidator(validator);
    return validator;
  }

  async listValidators(eventId: string): Promise<Validator[]> {
    await this.getEvent(eventId);
    return this.store.validatorsByEvent(eventId);
  }

  // -------------------------------------------------------------- club (M9)
  async createClub(input: {
    organizerId: string;
    name: string;
    city?: string;
    fidelityPriceCents?: number;
    fidelityUses?: number;
    ragioneSociale?: string;
    piva?: string;
    sedeLegale?: string;
    pec?: string;
    sdi?: string;
    iban?: string;
    genre?: string;
    color?: string;
  }): Promise<Club> {
    await this.getAccount(input.organizerId);
    if (!input.name.trim()) throw new DomainError("INVALID_CLUB", "nome club obbligatorio");
    const club: Club = {
      id: this.store.id("club"),
      organizerId: input.organizerId,
      name: input.name,
      city: input.city ?? "—",
      fidelityPriceCents: input.fidelityPriceCents ?? 0,
      fidelityUses: input.fidelityUses ?? 0,
      ragioneSociale: input.ragioneSociale,
      piva: input.piva,
      sedeLegale: input.sedeLegale,
      pec: input.pec,
      sdi: input.sdi,
      iban: input.iban,
      genre: input.genre,
      color: input.color
    };
    await this.store.createClub(club);
    return club;
  }

  async listClubs(): Promise<Club[]> {
    return this.store.listClubs();
  }

  async getClub(id: string): Promise<Club> {
    const c = await this.store.getClub(id);
    if (!c) throw NotFound("club");
    return c;
  }

  async clubEvents(clubId: string): Promise<Event[]> {
    return this.store.eventsByClub(clubId);
  }

  /** Acquisto del Fidelity del club: carnet multi-ingresso valido sugli eventi del club. */
  async purchaseFidelity(clubId: string, buyerId: string): Promise<Ticket> {
    const club = await this.getClub(clubId);
    const buyer = await this.getAccount(buyerId);
    if (club.fidelityUses <= 0) throw new DomainError("NO_FIDELITY", "questo club non ha un Fidelity", 409);
    const ticket: Ticket = {
      id: this.store.id("tkt"),
      eventId: "",
      clubId: club.id,
      kind: "FIDELITY",
      ownerId: buyer.id,
      tokenId: await this.store.nextTokenId(),
      originalPriceCents: club.fidelityPriceCents,
      paidCents: club.fidelityPriceCents,
      status: "ACTIVE",
      exportMode: "NONE",
      exitFeeCents: 0,
      holderName: `${buyer.nome} ${buyer.cognome}`,
      uses: club.fidelityUses,
      used: 0
    };
    await this.store.createTicket(ticket);
    return ticket;
  }

  // ----------------------------------------------------- acquisto primario
  /**
   * Registra l'acquisto primario. Se `opts.tokenId` non è fornito (path ordini /
   * acquisto diretto), conia il biglietto sul contratto via {@link ChainPort}:
   * con `ViemChain` è un mint REALE su TinftTicket.mint (tokenId + txHash on-chain);
   * con `FakeChain` (default, test) il risultato è deterministico. Quando il mint è
   * già avvenuto a monte (es. PaymentsService) `opts.tokenId`/`txHash` arrivano dal
   * chiamante e qui NON si conia di nuovo.
   */
  async purchasePrimary(
    eventId: string,
    buyerId: string,
    opts: {holderName?: string; tokenId?: number; txHash?: string} = {}
  ): Promise<Ticket> {
    const event = await this.getEvent(eventId);
    const buyer = await this.getAccount(buyerId);
    if (event.status !== "ON_SALE") throw new DomainError("NOT_ON_SALE", "evento non in vendita", 409);
    if (event.sold >= event.capacity) throw new DomainError("SOLD_OUT", "evento esaurito", 409);
    await this.assertCanAcquire(event.id, buyer);

    // Mint on-chain solo se non già coniato dal chiamante (evita doppio mint).
    let tokenId = opts.tokenId;
    let txHash = opts.txHash;
    if (tokenId === undefined) {
      const mint = await this.chain.mintTicket({
        to: buyer.walletAddress,
        reference: event.id, // off-chain eventId → uint on-chain (mappato dall'adapter)
        priceCents: event.priceCents
      });
      tokenId = mint.tokenId;
      txHash = mint.txHash;
    }

    const ticket: Ticket = {
      id: this.store.id("tkt"),
      eventId: event.id,
      ownerId: buyer.id,
      tokenId,
      originalPriceCents: event.priceCents,
      paidCents: event.priceCents,
      status: "ACTIVE",
      exportMode: "NONE",
      exitFeeCents: 0,
      holderName: opts.holderName?.trim() || `${buyer.nome} ${buyer.cognome}`,
      txHash
    };
    await this.store.createTicket(ticket);
    event.sold += 1;
    await this.store.updateEvent(event);
    return ticket;
  }

  // -------------------------------------------------------------- tier (v2)
  /** Crea una fascia di prezzo per un evento; solo l'organizzatore proprietario. */
  async createTier(eventId: string, input: {organizerId: string; name: string; priceCents: number; note?: string}): Promise<Tier> {
    const event = await this.getEvent(eventId);
    if (event.organizerId !== input.organizerId) throw new DomainError("NOT_OWNER", "non sei l'organizzatore dell'evento", 403);
    if (!input.name.trim()) throw new DomainError("INVALID_TIER", "nome fascia obbligatorio");
    if (input.priceCents < 0) throw new DomainError("INVALID_TIER", "prezzo non valido");
    const tier: Tier = {
      id: this.store.id("tier"),
      eventId: event.id,
      name: input.name,
      priceCents: input.priceCents,
      note: input.note,
      soldOut: false
    };
    await this.store.createTier(tier);
    return tier;
  }

  async listTiers(eventId: string): Promise<Tier[]> {
    await this.getEvent(eventId);
    return this.store.tiersByEvent(eventId);
  }

  // ----------------------------------------------------- ordini / checkout (v2)
  /** Crea un ordine PENDING con il dettaglio completo (commissione 10% + quantità + limite 2). */
  async createOrder(input: {buyerId: string; eventId: string; tierId?: string; quantity: number}): Promise<Order> {
    const event = await this.getEvent(input.eventId);
    await this.getAccount(input.buyerId);
    if (event.status !== "ON_SALE") throw new DomainError("NOT_ON_SALE", "evento non in vendita", 409);

    let unitPriceCents = event.priceCents;
    if (input.tierId) {
      const tier = await this.getTier(input.tierId);
      if (tier.eventId !== event.id) throw new DomainError("WRONG_TIER", "fascia non appartiene all'evento", 409);
      unitPriceCents = tier.priceCents;
    }

    const totals = orderTotalCents(unitPriceCents, input.quantity);
    await this.assertOrderWithinEventLimit(event.id, input.buyerId, totals.quantity);

    const order: Order = {
      id: this.store.id("ord"),
      buyerId: input.buyerId,
      eventId: event.id,
      tierId: input.tierId,
      quantity: totals.quantity,
      unitPriceCents: totals.unitPriceCents,
      presaleCommissionCents: totals.presaleCommissionCents,
      feeTotalCents: totals.feeTotalCents,
      subtotalCents: totals.subtotalCents,
      totalCents: totals.totalCents,
      status: "PENDING",
      ticketIds: [],
      createdAt: this.now()
    };
    await this.store.createOrder(order);
    return order;
  }

  /**
   * Conferma il pagamento ed *evade* l'ordine: conia i `quantity` biglietti, segna
   * PAID, accredita la commissione di prevendita (ledger) e il goodwill (compratore).
   *
   * RIPRENDIBILE, IDEMPOTENTE e SERIALIZZATO — requisito di affidabilità: un ordine
   * PAGATO non deve MAI andare perso, essere evaso due volte, né corrompersi se due
   * consegne del webbook arrivano in contemporanea.
   *  - Mutex per-ordine (in-processo): consegne concorrenti dello stesso ordine sono
   *    serializzate; la seconda trova l'ordine già PAID e diventa no-op.
   *  - Se un mint fallisce a metà (es. RPC on-chain giù), i biglietti già coniati
   *    restano legati all'ordine (persistiti dopo OGNI mint): una nuova chiamata
   *    RIPRENDE dai mancanti — niente doppio mint, niente `sold` raddoppiato.
   *  - L'accredito (biglietti + ledger + goodwill + stato PAID) è ATOMICO via
   *    `store.settleOrder` (transazione + lock di riga su Postgres): tutto-o-niente,
   *    nessuna finestra di doppio accredito o crash a metà scrittura.
   *
   * Nota prod (scale-out multi-istanza): per serializzare il mint anche tra processi
   * diversi serve un lock distribuito (es. advisory lock Postgres / Redis) all'avvio
   * di payOrder; oggi l'accredito è comunque protetto cross-processo dal lock di riga.
   */
  async payOrder(orderId: string): Promise<Order> {
    return this.withOrderLock(orderId, () => this.fulfillOrder(orderId));
  }

  private async fulfillOrder(orderId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (order.status === "PAID") return order; // già evaso: nessun doppio mint/accredito
    if (order.status === "CANCELLED") throw new DomainError("ORDER_CANCELLED", "ordine annullato", 409);

    // Riprendi dai biglietti già coniati per quest'ordine in un tentativo precedente.
    const ticketIds = [...order.ticketIds];
    for (let i = ticketIds.length; i < order.quantity; i++) {
      const ticket = await this.purchasePrimary(order.eventId, order.buyerId);
      // l'ordine fissa il prezzo unitario di fascia: il costo base segue il prezzo pagato
      ticket.originalPriceCents = order.unitPriceCents;
      ticket.paidCents = order.unitPriceCents;
      await this.store.updateTicket(ticket);
      ticketIds.push(ticket.id);
      // Persisti il progresso dopo OGNI mint: se il prossimo fallisce, la ripresa
      // riparte da qui (in Prisma lega i biglietti all'ordine via Ticket.orderId).
      order.ticketIds = ticketIds;
      await this.store.updateOrder(order);
    }

    // Accredito ATOMICO e idempotente (commissione + goodwill + stato PAID).
    return this.store.settleOrder({
      orderId,
      ticketIds,
      presaleCommissionCents: order.feeTotalCents,
      buyerId: order.buyerId,
      goodwillDelta: GOODWILL_PER_TICKET * order.quantity
    });
  }

  /**
   * Mutex asincrono per-chiave (in-processo): incatena le chiamate sulla stessa
   * chiave così che eseguano una alla volta. La catena memorizzata ingoia gli errori
   * per non propagarli ai successivi; il chiamante riceve comunque il proprio esito.
   */
  private readonly orderLocks = new Map<string, Promise<unknown>>();
  private withOrderLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.orderLocks.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(
      () => {},
      () => {}
    );
    this.orderLocks.set(key, tail);
    // pulizia: se nessun'altra chiamata si è accodata nel frattempo, libera la chiave
    void tail.then(() => {
      if (this.orderLocks.get(key) === tail) this.orderLocks.delete(key);
    });
    return run;
  }

  async getOrder(id: string): Promise<Order> {
    const o = await this.store.getOrder(id);
    if (!o) throw NotFound("ordine");
    return o;
  }

  async ordersOf(buyerId: string): Promise<Order[]> {
    return this.store.ordersByBuyer(buyerId);
  }

  // -------------------------------------------------- mercato secondario (v2)
  /** Mette in vendita un biglietto ACTIVE rispettando il tetto +5%; solo il proprietario. */
  async listTicket(ticketId: string, ownerId: string, priceCents: number): Promise<Ticket> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.ownerId !== ownerId) throw new DomainError("NOT_OWNER", "non sei il proprietario", 403);
    if (ticket.status !== "ACTIVE") throw new DomainError("NOT_ACTIVE", "biglietto non quotabile", 409);
    if (priceCents <= 0) throw new DomainError("INVALID_PRICE", "prezzo non valido");
    if (!isResalePriceAllowed(priceCents, ticket.paidCents)) {
      throw new DomainError("PRICE_ABOVE_CAP", "prezzo oltre il tetto +5%", 400);
    }
    ticket.status = "LISTED";
    ticket.askPriceCents = priceCents;
    ticket.market = "Re-Selling";
    await this.store.updateTicket(ticket);
    return ticket;
  }

  /** Ritira dal mercato un biglietto LISTED; solo il proprietario. */
  async unlistTicket(ticketId: string, ownerId: string): Promise<Ticket> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.ownerId !== ownerId) throw new DomainError("NOT_OWNER", "non sei il proprietario", 403);
    if (ticket.status !== "LISTED") throw new DomainError("NOT_LISTED", "biglietto non in vendita", 409);
    ticket.status = "ACTIVE";
    ticket.askPriceCents = undefined;
    ticket.market = undefined;
    await this.store.updateTicket(ticket);
    return ticket;
  }

  /** Listino del mercato secondario: biglietti LISTED con royalty e tetto calcolati. */
  async market(): Promise<Array<{
    ticketId: string;
    eventId: string;
    title: string;
    sellerName: string;
    askPriceCents: number;
    royaltyCents: number;
    capCents: number;
  }>> {
    const listed = await this.store.listedTickets();
    const out = [];
    for (const t of listed) {
      const event = await this.store.getEvent(t.eventId);
      out.push({
        ticketId: t.id,
        eventId: t.eventId,
        title: event?.title ?? "",
        sellerName: t.holderName,
        askPriceCents: t.askPriceCents ?? 0,
        royaltyCents: royaltyCents(t.originalPriceCents),
        capCents: resaleCapCents(t.paidCents)
      });
    }
    return out;
  }

  /**
   * Acquisto sul mercato secondario: il compratore paga ask + royalty (1% sul prezzo
   * originale), la royalty va al ledger 0,5/0,5, il costo base viaggia col token (R3),
   * il venditore riceve goodwill (~euro). Registra un Transfer PAYMENT/DONE.
   */
  async buyFromMarket(ticketId: string, buyerId: string): Promise<{
    ticket: Ticket;
    royalty: {tinftCents: number; organizerCents: number};
    paidByBuyerCents: number;
  }> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.status !== "LISTED") throw new DomainError("NOT_LISTED", "biglietto non in vendita", 409);
    const buyer = await this.getAccount(buyerId);
    const seller = await this.getAccount(ticket.ownerId);
    if (seller.id === buyer.id) throw new DomainError("SELF_TRANSFER", "venditore e compratore coincidono");
    await this.assertOrderWithinEventLimit(ticket.eventId, buyer.id, 1);

    const askPriceCents = ticket.askPriceCents ?? 0;
    const royalty = royaltyCents(ticket.originalPriceCents);
    const split = royaltySplitCents(ticket.originalPriceCents);
    const paidByBuyerCents = askPriceCents + royalty;

    const transfer: Transfer = {
      id: this.store.id("xfr"),
      ticketId: ticket.id,
      fromId: seller.id,
      toId: buyer.id,
      mode: "PAYMENT",
      priceCents: askPriceCents,
      royaltyCents: royalty,
      royaltyTinftCents: split.tinftCents,
      royaltyOrganizerCents: split.organizerCents,
      status: "DONE",
      ttlSeconds: 0,
      createdAt: this.now()
    };
    await this.store.createTransfer(transfer);

    // ledger: la royalty è ricavo di piattaforma/organizzatore
    await this.store.addToLedger({royaltyTinftCents: split.tinftCents, royaltyOrganizerCents: split.organizerCents});

    // trasferimento proprietà: il costo base segue il prezzo pagato (R3)
    ticket.ownerId = buyer.id;
    ticket.paidCents = askPriceCents;
    ticket.status = "ACTIVE";
    ticket.holderName = `${buyer.nome} ${buyer.cognome}`;
    ticket.askPriceCents = undefined;
    ticket.market = undefined;
    await this.store.updateTicket(ticket);

    // goodwill al venditore (~euro)
    seller.goodwill += Math.round(askPriceCents / 100);
    await this.store.updateAccount(seller);

    return {ticket, royalty: {tinftCents: split.tinftCents, organizerCents: split.organizerCents}, paidByBuyerCents};
  }

  /** Lega un'identità SPID verificata al wallet (abilita il limite 2/evento). */
  async verifyIdentity(accountId: string, cfHash: string): Promise<Account> {
    const account = await this.getAccount(accountId);
    account.cfHash = cfHash;
    account.verified = true;
    await this.store.updateAccount(account);
    return account;
  }

  async ticketsOf(ownerId: string): Promise<Ticket[]> {
    return this.store.ticketsByOwner(ownerId);
  }

  /** Carica un biglietto per id (404 se assente). Pubblico per le guardie di ownership al bordo HTTP. */
  async getTicketById(id: string): Promise<Ticket> {
    return this.getTicket(id);
  }

  // --------------------------------------------- trasferimento P2P (escrow)
  async createTransfer(
    ticketId: string,
    fromId: string,
    input: {mode: TransferMode; toId?: string; priceCents?: number; ttlSeconds?: number}
  ): Promise<Transfer> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.ownerId !== fromId) throw new DomainError("NOT_OWNER", "non sei il proprietario", 403);
    if (ticket.status !== "ACTIVE") throw new DomainError("NOT_ACTIVE", "biglietto non trasferibile", 409);

    let priceCents = 0;
    let royalty = 0;
    let split = {tinftCents: 0, organizerCents: 0};
    if (input.mode === "PAYMENT") {
      priceCents = input.priceCents ?? 0;
      if (priceCents <= 0) throw new DomainError("INVALID_PRICE", "prezzo non valido");
      if (!isResalePriceAllowed(priceCents, ticket.paidCents)) {
        throw new DomainError("PRICE_ABOVE_CAP", "prezzo oltre il tetto +5%", 409);
      }
      royalty = royaltyCents(ticket.originalPriceCents);
      split = royaltySplitCents(ticket.originalPriceCents);
    }

    const transfer: Transfer = {
      id: this.store.id("xfr"),
      ticketId: ticket.id,
      fromId,
      toId: input.toId,
      mode: input.mode,
      priceCents,
      royaltyCents: royalty,
      royaltyTinftCents: split.tinftCents,
      royaltyOrganizerCents: split.organizerCents,
      status: input.mode === "PAYMENT" ? "ESCROW" : "PENDING",
      ttlSeconds: input.ttlSeconds ?? 600,
      createdAt: this.now()
    };
    await this.store.createTransfer(transfer);
    ticket.status = "LISTED";
    await this.store.updateTicket(ticket);
    return transfer;
  }

  async acceptTransfer(transferId: string, toId: string, holderName?: string): Promise<Transfer> {
    const transfer = await this.getTransfer(transferId);
    if (transfer.status !== "PENDING" && transfer.status !== "ESCROW") {
      throw new DomainError("NOT_PENDING", "trasferimento non accettabile", 409);
    }
    if (transfer.toId && transfer.toId !== toId) {
      throw new DomainError("WRONG_RECIPIENT", "destinatario non corrispondente", 403);
    }
    const buyer = await this.getAccount(toId);
    if (buyer.id === transfer.fromId) throw new DomainError("SELF_TRANSFER", "venditore e compratore coincidono");
    const ticket = await this.getTicket(transfer.ticketId);
    await this.assertCanAcquire(ticket.eventId, buyer);

    ticket.ownerId = buyer.id;
    if (transfer.mode === "PAYMENT") ticket.paidCents = transfer.priceCents; // il costo base viaggia col token (R3)
    ticket.status = "ACTIVE";
    ticket.holderName = holderName?.trim() || `${buyer.nome} ${buyer.cognome}`;
    await this.store.updateTicket(ticket);

    transfer.toId = buyer.id;
    transfer.status = "DONE";
    await this.store.updateTransfer(transfer);
    return transfer;
  }

  /** Recupero: a timeout chiunque, oppure il venditore in qualsiasi momento (annullo). */
  async reclaimTransfer(transferId: string, byId?: string): Promise<Transfer> {
    const transfer = await this.getTransfer(transferId);
    if (transfer.status !== "PENDING" && transfer.status !== "ESCROW") {
      throw new DomainError("NOT_PENDING", "trasferimento non recuperabile", 409);
    }
    const expired = this.now() > transfer.createdAt + transfer.ttlSeconds;
    if (!expired && byId !== transfer.fromId) {
      throw new DomainError("NOT_EXPIRED", "non ancora scaduto", 409);
    }
    const ticket = await this.getTicket(transfer.ticketId);
    ticket.status = "ACTIVE"; // torna disponibile al venditore (resta ownerId = fromId)
    await this.store.updateTicket(ticket);
    transfer.status = "RECLAIMED";
    await this.store.updateTransfer(transfer);
    return transfer;
  }

  // ------------------------------------------------------------ validazione
  async validate(ticketId: string, validatorId?: string, scenario?: "screenshot"): Promise<Validation> {
    const ticket = await this.store.getTicket(ticketId);
    let outcome: ValidationOutcome;
    if (!ticket) outcome = "FAKE";
    else if (scenario === "screenshot") outcome = "SCREENSHOT";
    else if (ticket.status === "LISTED") outcome = "ESCROW"; // in trasferimento → accesso negato
    else if (ticket.status === "USED" || ticket.status === "EXPORTED") outcome = "DUPLICATE";
    else outcome = "VALID";

    if (outcome === "VALID" && ticket) {
      if (ticket.kind === "FIDELITY") {
        ticket.used = (ticket.used ?? 0) + 1;
        if ((ticket.used ?? 0) >= (ticket.uses ?? 1)) ticket.status = "USED"; // carnet esaurito
      } else {
        ticket.status = "USED";
      }
      await this.store.updateTicket(ticket);
    }

    const validation: Validation = {
      id: this.store.id("val"),
      ticketId,
      validatorId,
      outcome,
      at: this.now()
    };
    await this.store.createValidation(validation);
    return validation;
  }

  /**
   * Validazione lato app nativa: il validatore scansiona il QR a rotazione del
   * possessore (un token d'accesso firmato e a vita breve, {@link signAccessToken}).
   * Una scansione restituisce SEMPRE un esito (non lancia): un token scaduto è uno
   * screenshot (SCREENSHOT), uno manomesso/non firmato è un falso (FAKE). Se il
   * token è valido si delega alla {@link validate} esistente sul ticketId estratto
   * (ACTIVE→VALID+USED+Validation, USED/EXPORTED→DUPLICATE, LISTED/in-transfer→ESCROW).
   */
  async scanValidate(
    token: string,
    validatorId?: string
  ): Promise<{outcome: ValidationOutcome; holderName?: string; meta?: Record<string, unknown>}> {
    let ticketId: string;
    try {
      ({ticketId} = verifyAccessToken(token));
    } catch (err) {
      // una scansione non lancia: mappa l'errore del token su un esito
      if (err instanceof DomainError && err.code === "TOKEN_EXPIRED") return {outcome: "SCREENSHOT"};
      return {outcome: "FAKE"};
    }

    const ticket = await this.store.getTicket(ticketId);
    if (!ticket) return {outcome: "FAKE"};

    const validation = await this.validate(ticketId, validatorId);
    return {
      outcome: validation.outcome,
      holderName: ticket.holderName,
      meta: {ticketId: ticket.id, eventId: ticket.eventId, tokenId: ticket.tokenId}
    };
  }

  // ----------------------------------------------------------------- export
  async exportTicket(ticketId: string, ownerId: string, mode: "FREE" | "ENFORCED"): Promise<Ticket> {
    const ticket = await this.getTicket(ticketId);
    if (ticket.ownerId !== ownerId) throw new DomainError("NOT_OWNER", "non sei il proprietario", 403);
    if (ticket.exportMode !== "NONE") throw new DomainError("ALREADY_EXPORTED", "già esportato", 409);
    if (ticket.status !== "USED") throw new DomainError("NOT_USED", "esportabile solo a evento concluso", 409);

    ticket.exportMode = mode;
    ticket.exitFeeCents = mode === "FREE" ? exitFeeCents(ticket.originalPriceCents) : 0;
    // l'export libero versa la fee d'uscita (25%) al ledger di piattaforma
    if (mode === "FREE") await this.store.addToLedger({exitFeeCents: ticket.exitFeeCents});
    ticket.status = "EXPORTED";
    await this.store.updateTicket(ticket);
    return ticket;
  }

  // ------------------------------------------------------------- helpers
  private async assertCanAcquire(eventId: string, buyer: Account): Promise<void> {
    if (!buyer.cfHash) return; // wallet non registrato: esente (il backend registra via SPID)
    const held = await this.store.heldCountForIdentity(eventId, buyer.cfHash);
    if (!canAcquireForEvent(held)) throw new DomainError("EVENT_LIMIT", "max 2 biglietti per evento", 409);
  }

  /**
   * Limite 2/evento per ordini e mercato: conta i biglietti del compratore (ACTIVE/LISTED)
   * più i trasferimenti in entrata pendenti per l'evento; verifica che la quantità richiesta
   * rientri nell'allowance residua (MAX_PER_EVENT - controllati).
   */
  private async assertOrderWithinEventLimit(eventId: string, buyerId: string, quantity: number): Promise<void> {
    const held = await this.store.heldForEventByBuyer(eventId, buyerId);
    const remaining = MAX_PER_EVENT - held;
    if (quantity > remaining) {
      throw new DomainError("EVENT_LIMIT", `max ${MAX_PER_EVENT} biglietti per evento`, 409);
    }
  }

  private async getTier(id: string): Promise<Tier> {
    const t = await this.store.getTier(id);
    if (!t) throw NotFound("fascia");
    return t;
  }

  private async getAccount(id: string): Promise<Account> {
    const a = await this.store.getAccount(id);
    if (!a) throw NotFound("account");
    return a;
  }

  private async getTicket(id: string): Promise<Ticket> {
    const t = await this.store.getTicket(id);
    if (!t) throw NotFound("biglietto");
    return t;
  }

  private async getTransfer(id: string): Promise<Transfer> {
    const x = await this.store.getTransfer(id);
    if (!x) throw NotFound("trasferimento");
    return x;
  }
}
