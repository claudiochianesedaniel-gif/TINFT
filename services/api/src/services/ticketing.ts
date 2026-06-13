import {
  type Account,
  type AccountRole,
  type Club,
  DomainError,
  type Event,
  type EventType,
  NotFound,
  type Ticket,
  type Transfer,
  type TransferMode,
  type Validation,
  type ValidationOutcome
} from "../domain/models";
import {MemoryStore} from "../repo/memory";
import {canAcquireForEvent, exitFeeCents, isResalePriceAllowed, royaltyCents, royaltySplitCents} from "../domain/rules";

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Servizio applicativo TINFT: orchestra i flussi dei 4 profili applicando le
 * regole economiche (rules.ts), le stesse enforced on-chain dai contratti M1–M5.
 * Il regolamento on-chain (mint/escrow) verrà agganciato via job nei pagamenti (M7).
 */
export class TicketingService {
  constructor(
    private readonly store: MemoryStore,
    private readonly now: () => number = nowSeconds
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
  }): Account {
    const account: Account = {
      id: this.store.id("acc"),
      role: input.role ?? "CLIENTE",
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
      goodwill: 0
    };
    this.store.accounts.set(account.id, account);
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
      status: "ON_SALE"
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

  // -------------------------------------------------------------- club (M9)
  createClub(input: {organizerId: string; name: string; city?: string; fidelityPriceCents?: number; fidelityUses?: number}): Club {
    this.getAccount(input.organizerId);
    if (!input.name.trim()) throw new DomainError("INVALID_CLUB", "nome club obbligatorio");
    const club: Club = {
      id: this.store.id("club"),
      organizerId: input.organizerId,
      name: input.name,
      city: input.city ?? "—",
      fidelityPriceCents: input.fidelityPriceCents ?? 0,
      fidelityUses: input.fidelityUses ?? 0
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
    ticket.status = "EXPORTED";
    return ticket;
  }

  // ------------------------------------------------------------- helpers
  private assertCanAcquire(eventId: string, buyer: Account): void {
    if (!buyer.cfHash) return; // wallet non registrato: esente (il backend registra via SPID)
    const held = this.store.heldCountForIdentity(eventId, buyer.cfHash);
    if (!canAcquireForEvent(held)) throw new DomainError("EVENT_LIMIT", "max 2 biglietti per evento", 409);
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
