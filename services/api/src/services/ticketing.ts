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
import {MemoryStore} from "../repo/memory";
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

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Servizio applicativo TINFT: orchestra i flussi dei 4 profili applicando le
 * regole economiche (rules.ts), le stesse enforced on-chain dai contratti M1–M5.
 * Il regolamento on-chain (mint/escrow) verrà agganciato via job nei pagamenti (M7).
 */
export class TicketingService {
  constructor(
    private readonly store: MemoryStore,
    private readonly now: () => number = nowSeconds,
    private readonly verifier: IdentityVerifier = new FakeSpid()
  ) {}

  // -------------------------------------------------------------- account
  createAccount(input: {
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
  }): Account {
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
    this.store.accounts.set(account.id, account);
    return account;
  }

  /** Cerca un account per email (case-insensitive). Per il login. */
  findAccountByEmail(email: string): Account | undefined {
    const target = email.trim().toLowerCase();
    return [...this.store.accounts.values()].find((a) => a.email.trim().toLowerCase() === target);
  }

  // --------------------------------------------- registrazione email + OTP (v2)
  /** Avvia la registrazione via email: genera un codice OTP a 6 cifre e tiene il dato in attesa. */
  startEmailRegistration(input: {
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
  }): {email: string; devCode: string} {
    if (!input.email?.trim()) throw new DomainError("INVALID_EMAIL", "email obbligatoria");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.store.pendingRegistrations.set(input.email, {
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
  verifyEmailRegistration(email: string, code: string): Account {
    const pending = this.store.pendingRegistrations.get(email);
    if (!pending || pending.code !== code) throw new DomainError("BAD_CODE", "codice errato o scaduto", 400);
    const identity = this.verifier.verify({cf: pending.cf, nome: pending.nome, cognome: pending.cognome});
    const account = this.createAccount({
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
    this.store.pendingRegistrations.delete(email);
    return account;
  }

  /** GDPR — diritto alla cancellazione: elimina l'account e i suoi biglietti (dati collegati). */
  deleteAccount(id: string): {deleted: string; tickets: number} {
    if (!this.store.accounts.get(id)) throw NotFound("account");
    this.store.accounts.delete(id);
    let removed = 0;
    for (const t of [...this.store.tickets.values()]) {
      if (t.ownerId === id) {
        this.store.tickets.delete(t.id);
        removed++;
      }
    }
    return {deleted: id, tickets: removed};
  }

  // -------------------------------------------------------------- eventi
  createEvent(input: {
    organizerId: string;
    clubId?: string;
    title: string;
    venue: string;
    date: string;
    type?: EventType;
    priceCents: number;
    capacity: number;
    status?: EventStatus;
  }): Event {
    this.getAccount(input.organizerId);
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
    this.store.events.set(event.id, event);
    return event;
  }

  listEvents(): Event[] {
    return [...this.store.events.values()];
  }

  getEvent(id: string): Event {
    const e = this.store.events.get(id);
    if (!e) throw NotFound("evento");
    return e;
  }

  // ----------------------------------------------- KYC organizzatore (B7)
  /** L'organizzatore invia il KYC: da NONE/REJECTED passa a PENDING. */
  submitKyc(organizerId: string): Account {
    const org = this.getAccount(organizerId);
    if (org.role !== "ORGANIZER") throw new DomainError("NOT_ORGANIZER", "non è un organizzatore", 409);
    const status = org.kycStatus ?? "NONE";
    if (status !== "NONE" && status !== "REJECTED") {
      throw new DomainError("KYC_STATE", `KYC non inviabile dallo stato ${status}`, 409);
    }
    org.kycStatus = "PENDING";
    return org;
  }

  /** Decisione admin sul KYC: VERIFIED o REJECTED (il gating del token è in server.ts). */
  decideKyc(organizerId: string, decision: "VERIFIED" | "REJECTED"): Account {
    const org = this.getAccount(organizerId);
    if (org.role !== "ORGANIZER") throw new DomainError("NOT_ORGANIZER", "non è un organizzatore", 409);
    if (decision !== "VERIFIED" && decision !== "REJECTED") {
      throw new DomainError("INVALID_DECISION", "decisione non valida", 400);
    }
    org.kycStatus = decision;
    return org;
  }

  /** Pubblica un evento DRAFT → ON_SALE; solo l'organizzatore proprietario e con KYC verificato. */
  publishEvent(eventId: string, organizerId: string): Event {
    const event = this.getEvent(eventId);
    if (event.organizerId !== organizerId) throw new DomainError("NOT_OWNER", "non sei l'organizzatore dell'evento", 403);
    const org = this.getAccount(organizerId);
    if ((org.kycStatus ?? "NONE") !== "VERIFIED") {
      throw new DomainError("KYC_REQUIRED", "KYC organizzatore non verificato", 403);
    }
    if (event.status === "ON_SALE") return event; // idempotente
    if (event.status !== "DRAFT") throw new DomainError("NOT_DRAFT", "evento non in bozza", 409);
    event.status = "ON_SALE";
    return event;
  }

  // ------------------------------------------------ varchi / validatori (B6)
  /** Crea un varco (gate) per l'evento; solo l'organizzatore proprietario. */
  createValidator(eventId: string, organizerId: string): Validator {
    const event = this.getEvent(eventId);
    if (event.organizerId !== organizerId) throw new DomainError("NOT_OWNER", "non sei l'organizzatore dell'evento", 403);
    const code = "VARCO-" + Math.floor(1000 + Math.random() * 9000);
    const validator: Validator = {
      id: this.store.id("gate"),
      eventId: event.id,
      code,
      createdAt: this.now()
    };
    this.store.validators.set(validator.id, validator);
    return validator;
  }

  listValidators(eventId: string): Validator[] {
    this.getEvent(eventId);
    return this.store.validatorsByEvent(eventId);
  }

  // -------------------------------------------------------------- club (M9)
  createClub(input: {
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
  }): Club {
    this.getAccount(input.organizerId);
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
    this.store.clubs.set(club.id, club);
    return club;
  }

  listClubs(): Club[] {
    return [...this.store.clubs.values()];
  }

  getClub(id: string): Club {
    const c = this.store.clubs.get(id);
    if (!c) throw NotFound("club");
    return c;
  }

  clubEvents(clubId: string): Event[] {
    return [...this.store.events.values()].filter((e) => e.clubId === clubId);
  }

  /** Acquisto del Fidelity del club: carnet multi-ingresso valido sugli eventi del club. */
  purchaseFidelity(clubId: string, buyerId: string): Ticket {
    const club = this.getClub(clubId);
    const buyer = this.getAccount(buyerId);
    if (club.fidelityUses <= 0) throw new DomainError("NO_FIDELITY", "questo club non ha un Fidelity", 409);
    const ticket: Ticket = {
      id: this.store.id("tkt"),
      eventId: "",
      clubId: club.id,
      kind: "FIDELITY",
      ownerId: buyer.id,
      tokenId: this.store.nextTokenId(),
      originalPriceCents: club.fidelityPriceCents,
      paidCents: club.fidelityPriceCents,
      status: "ACTIVE",
      exportMode: "NONE",
      exitFeeCents: 0,
      holderName: `${buyer.nome} ${buyer.cognome}`,
      uses: club.fidelityUses,
      used: 0
    };
    this.store.tickets.set(ticket.id, ticket);
    return ticket;
  }

  // ----------------------------------------------------- acquisto primario
  /** Registra l'acquisto primario. `opts.tokenId`/`txHash` arrivano dal mint on-chain. */
  purchasePrimary(
    eventId: string,
    buyerId: string,
    opts: {holderName?: string; tokenId?: number; txHash?: string} = {}
  ): Ticket {
    const event = this.getEvent(eventId);
    const buyer = this.getAccount(buyerId);
    if (event.status !== "ON_SALE") throw new DomainError("NOT_ON_SALE", "evento non in vendita", 409);
    if (event.sold >= event.capacity) throw new DomainError("SOLD_OUT", "evento esaurito", 409);
    this.assertCanAcquire(event.id, buyer);

    const ticket: Ticket = {
      id: this.store.id("tkt"),
      eventId: event.id,
      ownerId: buyer.id,
      tokenId: opts.tokenId ?? this.store.nextTokenId(),
      originalPriceCents: event.priceCents,
      paidCents: event.priceCents,
      status: "ACTIVE",
      exportMode: "NONE",
      exitFeeCents: 0,
      holderName: opts.holderName?.trim() || `${buyer.nome} ${buyer.cognome}`,
      txHash: opts.txHash
    };
    this.store.tickets.set(ticket.id, ticket);
    event.sold += 1;
    return ticket;
  }

  // -------------------------------------------------------------- tier (v2)
  /** Crea una fascia di prezzo per un evento; solo l'organizzatore proprietario. */
  createTier(eventId: string, input: {organizerId: string; name: string; priceCents: number; note?: string}): Tier {
    const event = this.getEvent(eventId);
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
    this.store.tiers.set(tier.id, tier);
    return tier;
  }

  listTiers(eventId: string): Tier[] {
    this.getEvent(eventId);
    return this.store.tiersByEvent(eventId);
  }

  // ----------------------------------------------------- ordini / checkout (v2)
  /** Crea un ordine PENDING con il dettaglio completo (commissione 4% + quantità + limite 2). */
  createOrder(input: {buyerId: string; eventId: string; tierId?: string; quantity: number}): Order {
    const event = this.getEvent(input.eventId);
    this.getAccount(input.buyerId);
    if (event.status !== "ON_SALE") throw new DomainError("NOT_ON_SALE", "evento non in vendita", 409);

    let unitPriceCents = event.priceCents;
    if (input.tierId) {
      const tier = this.getTier(input.tierId);
      if (tier.eventId !== event.id) throw new DomainError("WRONG_TIER", "fascia non appartiene all'evento", 409);
      unitPriceCents = tier.priceCents;
    }

    const totals = orderTotalCents(unitPriceCents, input.quantity);
    this.assertOrderWithinEventLimit(event.id, input.buyerId, totals.quantity);

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
    this.store.orders.set(order.id, order);
    return order;
  }

  /**
   * Simula il successo PSP: conia `quantity` biglietti, segna l'ordine PAID,
   * accredita la commissione al ledger e il goodwill al compratore. Idempotente.
   */
  payOrder(orderId: string): Order {
    const order = this.getOrder(orderId);
    if (order.status === "PAID") return order; // idempotente: nessun doppio mint
    if (order.status === "CANCELLED") throw new DomainError("ORDER_CANCELLED", "ordine annullato", 409);

    const ticketIds: string[] = [];
    for (let i = 0; i < order.quantity; i++) {
      const ticket = this.purchasePrimary(order.eventId, order.buyerId);
      // l'ordine fissa il prezzo unitario di fascia: il costo base segue il prezzo pagato
      ticket.originalPriceCents = order.unitPriceCents;
      ticket.paidCents = order.unitPriceCents;
      ticketIds.push(ticket.id);
    }

    this.store.ledger.presaleCommissionCents += order.feeTotalCents;
    const buyer = this.getAccount(order.buyerId);
    buyer.goodwill += GOODWILL_PER_TICKET * order.quantity;

    order.ticketIds = ticketIds;
    order.status = "PAID";
    return order;
  }

  getOrder(id: string): Order {
    const o = this.store.orders.get(id);
    if (!o) throw NotFound("ordine");
    return o;
  }

  ordersOf(buyerId: string): Order[] {
    return this.store.ordersByBuyer(buyerId);
  }

  // -------------------------------------------------- mercato secondario (v2)
  /** Mette in vendita un biglietto ACTIVE rispettando il tetto +5%; solo il proprietario. */
  listTicket(ticketId: string, ownerId: string, priceCents: number): Ticket {
    const ticket = this.getTicket(ticketId);
    if (ticket.ownerId !== ownerId) throw new DomainError("NOT_OWNER", "non sei il proprietario", 403);
    if (ticket.status !== "ACTIVE") throw new DomainError("NOT_ACTIVE", "biglietto non quotabile", 409);
    if (priceCents <= 0) throw new DomainError("INVALID_PRICE", "prezzo non valido");
    if (!isResalePriceAllowed(priceCents, ticket.paidCents)) {
      throw new DomainError("PRICE_ABOVE_CAP", "prezzo oltre il tetto +5%", 400);
    }
    ticket.status = "LISTED";
    ticket.askPriceCents = priceCents;
    ticket.market = "Re-Selling";
    return ticket;
  }

  /** Ritira dal mercato un biglietto LISTED; solo il proprietario. */
  unlistTicket(ticketId: string, ownerId: string): Ticket {
    const ticket = this.getTicket(ticketId);
    if (ticket.ownerId !== ownerId) throw new DomainError("NOT_OWNER", "non sei il proprietario", 403);
    if (ticket.status !== "LISTED") throw new DomainError("NOT_LISTED", "biglietto non in vendita", 409);
    ticket.status = "ACTIVE";
    ticket.askPriceCents = undefined;
    ticket.market = undefined;
    return ticket;
  }

  /** Listino del mercato secondario: biglietti LISTED con royalty e tetto calcolati. */
  market(): Array<{
    ticketId: string;
    eventId: string;
    title: string;
    sellerName: string;
    askPriceCents: number;
    royaltyCents: number;
    capCents: number;
  }> {
    return this.store.listedTickets().map((t) => ({
      ticketId: t.id,
      eventId: t.eventId,
      title: this.store.events.get(t.eventId)?.title ?? "",
      sellerName: t.holderName,
      askPriceCents: t.askPriceCents ?? 0,
      royaltyCents: royaltyCents(t.originalPriceCents),
      capCents: resaleCapCents(t.paidCents)
    }));
  }

  /**
   * Acquisto sul mercato secondario: il compratore paga ask + royalty (1% sul prezzo
   * originale), la royalty va al ledger 0,5/0,5, il costo base viaggia col token (R3),
   * il venditore riceve goodwill (~euro). Registra un Transfer PAYMENT/DONE.
   */
  buyFromMarket(ticketId: string, buyerId: string): {
    ticket: Ticket;
    royalty: {tinftCents: number; organizerCents: number};
    paidByBuyerCents: number;
  } {
    const ticket = this.getTicket(ticketId);
    if (ticket.status !== "LISTED") throw new DomainError("NOT_LISTED", "biglietto non in vendita", 409);
    const buyer = this.getAccount(buyerId);
    const seller = this.getAccount(ticket.ownerId);
    if (seller.id === buyer.id) throw new DomainError("SELF_TRANSFER", "venditore e compratore coincidono");
    this.assertOrderWithinEventLimit(ticket.eventId, buyer.id, 1);

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
    this.store.transfers.set(transfer.id, transfer);

    // ledger: la royalty è ricavo di piattaforma/organizzatore
    this.store.ledger.royaltyTinftCents += split.tinftCents;
    this.store.ledger.royaltyOrganizerCents += split.organizerCents;

    // trasferimento proprietà: il costo base segue il prezzo pagato (R3)
    ticket.ownerId = buyer.id;
    ticket.paidCents = askPriceCents;
    ticket.status = "ACTIVE";
    ticket.holderName = `${buyer.nome} ${buyer.cognome}`;
    ticket.askPriceCents = undefined;
    ticket.market = undefined;

    // goodwill al venditore (~euro)
    seller.goodwill += Math.round(askPriceCents / 100);

    return {ticket, royalty: {tinftCents: split.tinftCents, organizerCents: split.organizerCents}, paidByBuyerCents};
  }

  /** Lega un'identità SPID verificata al wallet (abilita il limite 2/evento). */
  verifyIdentity(accountId: string, cfHash: string): Account {
    const account = this.getAccount(accountId);
    account.cfHash = cfHash;
    account.verified = true;
    return account;
  }

  ticketsOf(ownerId: string): Ticket[] {
    return this.store.ticketsByOwner(ownerId);
  }

  // --------------------------------------------- trasferimento P2P (escrow)
  createTransfer(
    ticketId: string,
    fromId: string,
    input: {mode: TransferMode; toId?: string; priceCents?: number; ttlSeconds?: number}
  ): Transfer {
    const ticket = this.getTicket(ticketId);
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
    this.store.transfers.set(transfer.id, transfer);
    ticket.status = "LISTED";
    return transfer;
  }

  acceptTransfer(transferId: string, toId: string, holderName?: string): Transfer {
    const transfer = this.getTransfer(transferId);
    if (transfer.status !== "PENDING" && transfer.status !== "ESCROW") {
      throw new DomainError("NOT_PENDING", "trasferimento non accettabile", 409);
    }
    if (transfer.toId && transfer.toId !== toId) {
      throw new DomainError("WRONG_RECIPIENT", "destinatario non corrispondente", 403);
    }
    const buyer = this.getAccount(toId);
    if (buyer.id === transfer.fromId) throw new DomainError("SELF_TRANSFER", "venditore e compratore coincidono");
    const ticket = this.getTicket(transfer.ticketId);
    this.assertCanAcquire(ticket.eventId, buyer);

    ticket.ownerId = buyer.id;
    if (transfer.mode === "PAYMENT") ticket.paidCents = transfer.priceCents; // il costo base viaggia col token (R3)
    ticket.status = "ACTIVE";
    ticket.holderName = holderName?.trim() || `${buyer.nome} ${buyer.cognome}`;

    transfer.toId = buyer.id;
    transfer.status = "DONE";
    return transfer;
  }

  /** Recupero: a timeout chiunque, oppure il venditore in qualsiasi momento (annullo). */
  reclaimTransfer(transferId: string, byId?: string): Transfer {
    const transfer = this.getTransfer(transferId);
    if (transfer.status !== "PENDING" && transfer.status !== "ESCROW") {
      throw new DomainError("NOT_PENDING", "trasferimento non recuperabile", 409);
    }
    const expired = this.now() > transfer.createdAt + transfer.ttlSeconds;
    if (!expired && byId !== transfer.fromId) {
      throw new DomainError("NOT_EXPIRED", "non ancora scaduto", 409);
    }
    const ticket = this.getTicket(transfer.ticketId);
    ticket.status = "ACTIVE"; // torna disponibile al venditore (resta ownerId = fromId)
    transfer.status = "RECLAIMED";
    return transfer;
  }

  // ------------------------------------------------------------ validazione
  validate(ticketId: string, validatorId?: string, scenario?: "screenshot"): Validation {
    const ticket = this.store.tickets.get(ticketId);
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
    }

    const validation: Validation = {
      id: this.store.id("val"),
      ticketId,
      validatorId,
      outcome,
      at: this.now()
    };
    this.store.validations.set(validation.id, validation);
    return validation;
  }

  // ----------------------------------------------------------------- export
  exportTicket(ticketId: string, ownerId: string, mode: "FREE" | "ENFORCED"): Ticket {
    const ticket = this.getTicket(ticketId);
    if (ticket.ownerId !== ownerId) throw new DomainError("NOT_OWNER", "non sei il proprietario", 403);
    if (ticket.exportMode !== "NONE") throw new DomainError("ALREADY_EXPORTED", "già esportato", 409);
    if (ticket.status !== "USED") throw new DomainError("NOT_USED", "esportabile solo a evento concluso", 409);

    ticket.exportMode = mode;
    ticket.exitFeeCents = mode === "FREE" ? exitFeeCents(ticket.originalPriceCents) : 0;
    // l'export libero versa la fee d'uscita (25%) al ledger di piattaforma
    if (mode === "FREE") this.store.ledger.exitFeeCents += ticket.exitFeeCents;
    ticket.status = "EXPORTED";
    return ticket;
  }

  // ------------------------------------------------------------- helpers
  private assertCanAcquire(eventId: string, buyer: Account): void {
    if (!buyer.cfHash) return; // wallet non registrato: esente (il backend registra via SPID)
    const held = this.store.heldCountForIdentity(eventId, buyer.cfHash);
    if (!canAcquireForEvent(held)) throw new DomainError("EVENT_LIMIT", "max 2 biglietti per evento", 409);
  }

  /**
   * Limite 2/evento per ordini e mercato: conta i biglietti del compratore (ACTIVE/LISTED)
   * più i trasferimenti in entrata pendenti per l'evento; verifica che la quantità richiesta
   * rientri nell'allowance residua (MAX_PER_EVENT - controllati).
   */
  private assertOrderWithinEventLimit(eventId: string, buyerId: string, quantity: number): void {
    const held = this.store.heldForEventByBuyer(eventId, buyerId);
    const remaining = MAX_PER_EVENT - held;
    if (quantity > remaining) {
      throw new DomainError("EVENT_LIMIT", `max ${MAX_PER_EVENT} biglietti per evento`, 409);
    }
  }

  private getTier(id: string): Tier {
    const t = this.store.tiers.get(id);
    if (!t) throw NotFound("fascia");
    return t;
  }

  private getAccount(id: string): Account {
    const a = this.store.accounts.get(id);
    if (!a) throw NotFound("account");
    return a;
  }

  private getTicket(id: string): Ticket {
    const t = this.store.tickets.get(id);
    if (!t) throw NotFound("biglietto");
    return t;
  }

  private getTransfer(id: string): Transfer {
    const x = this.store.transfers.get(id);
    if (!x) throw NotFound("trasferimento");
    return x;
  }
}
