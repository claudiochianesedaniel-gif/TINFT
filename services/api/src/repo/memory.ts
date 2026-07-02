import type {
  Account,
  Artist,
  BlogPost,
  Club,
  Event,
  Ledger,
  News,
  Order,
  PendingRegistration,
  Ticket,
  Tier,
  Transfer,
  Validation,
  Validator
} from "../domain/models";
import type {Payment} from "../payments/types";
import type {Store} from "./store";

/**
 * Store in-memory: implementa {@link Store} per i test e lo sviluppo locale
 * (default del prototipo, con persistenza su file via snapshot/restore).
 * In produzione l'adapter Prisma su PostgreSQL ({@link ../repo/prisma-store.PrismaStore})
 * implementa la stessa interfaccia; i servizi dipendono solo da `Store`.
 *
 * Le Map e il ledger restano pubblici per la persistenza su file (snapshot) e per
 * i test esistenti; i servizi però usano esclusivamente i metodi async di Store.
 */
export class MemoryStore implements Store {
  readonly accounts = new Map<string, Account>();
  readonly clubs = new Map<string, Club>();
  readonly events = new Map<string, Event>();
  readonly tiers = new Map<string, Tier>();
  readonly orders = new Map<string, Order>();
  readonly tickets = new Map<string, Ticket>();
  readonly transfers = new Map<string, Transfer>();
  readonly validations = new Map<string, Validation>();
  readonly validators = new Map<string, Validator>();
  readonly payments = new Map<string, Payment>();
  readonly pendingRegistrations = new Map<string, PendingRegistration>();
  readonly processedWebhooks = new Set<string>();

  // contenuti editoriali (seedati nel costruttore)
  readonly artists = new Map<string, Artist>();
  readonly blogPosts = new Map<string, BlogPost>();
  readonly news = new Map<string, News>();

  /** Ledger di piattaforma: ricavi (commissioni di prevendita, royalty, fee d'uscita). */
  readonly ledger: Ledger = {
    presaleCommissionCents: 0,
    royaltyTinftCents: 0,
    royaltyOrganizerCents: 0,
    exitFeeCents: 0
  };

  private seq: Record<string, number> = {};
  private tokenSeq = 0;

  constructor() {
    this.seedContentSync();
  }

  // -------- generatori di id --------------------------------------------------
  id(prefix: string): string {
    this.seq[prefix] = (this.seq[prefix] ?? 0) + 1;
    return `${prefix}_${this.seq[prefix]}`;
  }

  async nextTokenId(): Promise<number> {
    return ++this.tokenSeq;
  }

  // -------- account -----------------------------------------------------------
  async getAccount(id: string): Promise<Account | undefined> {
    return this.accounts.get(id);
  }

  async getAccountByEmail(email: string): Promise<Account | undefined> {
    const target = email.trim().toLowerCase();
    return [...this.accounts.values()].find((a) => a.email.trim().toLowerCase() === target);
  }

  async listAccounts(): Promise<Account[]> {
    return [...this.accounts.values()];
  }

  async createAccount(account: Account): Promise<Account> {
    this.accounts.set(account.id, account);
    return account;
  }

  async updateAccount(account: Account): Promise<Account> {
    this.accounts.set(account.id, account);
    return account;
  }

  async deleteAccount(id: string): Promise<void> {
    this.accounts.delete(id);
  }

  // -------- club --------------------------------------------------------------
  async getClub(id: string): Promise<Club | undefined> {
    return this.clubs.get(id);
  }

  async listClubs(): Promise<Club[]> {
    return [...this.clubs.values()];
  }

  async createClub(club: Club): Promise<Club> {
    this.clubs.set(club.id, club);
    return club;
  }

  async updateClub(club: Club): Promise<Club> {
    this.clubs.set(club.id, club);
    return club;
  }

  // -------- eventi ------------------------------------------------------------
  async getEvent(id: string): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async getEventByGateCode(code: string): Promise<Event | undefined> {
    return [...this.events.values()].find((e) => e.gateCode === code);
  }

  async listEvents(): Promise<Event[]> {
    return [...this.events.values()];
  }

  async eventsByOrganizer(organizerId: string): Promise<Event[]> {
    return [...this.events.values()].filter((e) => e.organizerId === organizerId);
  }

  async eventsByClub(clubId: string): Promise<Event[]> {
    return [...this.events.values()].filter((e) => e.clubId === clubId);
  }

  async createEvent(event: Event): Promise<Event> {
    this.events.set(event.id, event);
    return event;
  }

  async updateEvent(event: Event): Promise<Event> {
    this.events.set(event.id, event);
    return event;
  }

  // -------- tier --------------------------------------------------------------
  async getTier(id: string): Promise<Tier | undefined> {
    return this.tiers.get(id);
  }

  async tiersByEvent(eventId: string): Promise<Tier[]> {
    return [...this.tiers.values()].filter((t) => t.eventId === eventId);
  }

  async createTier(tier: Tier): Promise<Tier> {
    this.tiers.set(tier.id, tier);
    return tier;
  }

  async updateTier(tier: Tier): Promise<Tier> {
    this.tiers.set(tier.id, tier);
    return tier;
  }

  // -------- ordini ------------------------------------------------------------
  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async ordersByBuyer(buyerId: string): Promise<Order[]> {
    return [...this.orders.values()].filter((o) => o.buyerId === buyerId);
  }

  async createOrder(order: Order): Promise<Order> {
    this.orders.set(order.id, order);
    return order;
  }

  async updateOrder(order: Order): Promise<Order> {
    this.orders.set(order.id, order);
    return order;
  }

  async settleOrder(input: {
    orderId: string;
    ticketIds: string[];
    presaleCommissionCents: number;
    buyerId: string;
    goodwillDelta: number;
  }): Promise<Order> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new Error(`settleOrder: ordine ${input.orderId} inesistente`);
    if (order.status === "PAID") return order; // idempotente: già evaso
    // Blocco sincrono: in JS (single-thread, nessun await qui) è atomico.
    order.ticketIds = input.ticketIds;
    this.ledger.presaleCommissionCents += input.presaleCommissionCents;
    const buyer = this.accounts.get(input.buyerId);
    if (buyer) buyer.goodwill += input.goodwillDelta;
    order.status = "PAID";
    return order;
  }

  // -------- biglietti ---------------------------------------------------------
  async getTicket(id: string): Promise<Ticket | undefined> {
    return this.tickets.get(id);
  }

  async ticketsByOwner(ownerId: string): Promise<Ticket[]> {
    return [...this.tickets.values()].filter((t) => t.ownerId === ownerId);
  }

  async listedTickets(): Promise<Ticket[]> {
    return [...this.tickets.values()].filter((t) => t.status === "LISTED");
  }

  async heldCountForIdentity(eventId: string, cfHash: string): Promise<number> {
    const owners = new Set(
      [...this.accounts.values()].filter((a) => a.cfHash === cfHash).map((a) => a.id)
    );
    return [...this.tickets.values()].filter(
      (t) => t.eventId === eventId && owners.has(t.ownerId) && (t.status === "ACTIVE" || t.status === "LISTED")
    ).length;
  }

  async heldForEventByBuyer(eventId: string, buyerId: string): Promise<number> {
    const tickets = [...this.tickets.values()].filter(
      (t) => t.eventId === eventId && t.ownerId === buyerId && (t.status === "ACTIVE" || t.status === "LISTED")
    ).length;
    const incoming = [...this.transfers.values()].filter((x) => {
      if (x.toId !== buyerId) return false;
      if (x.status !== "PENDING" && x.status !== "ESCROW") return false;
      const ticket = this.tickets.get(x.ticketId);
      return !!ticket && ticket.eventId === eventId;
    }).length;
    return tickets + incoming;
  }

  async createTicket(ticket: Ticket): Promise<Ticket> {
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  async updateTicket(ticket: Ticket): Promise<Ticket> {
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  async deleteTicket(id: string): Promise<void> {
    this.tickets.delete(id);
  }

  // -------- trasferimenti -----------------------------------------------------
  async getTransfer(id: string): Promise<Transfer | undefined> {
    return this.transfers.get(id);
  }

  async listTransfers(): Promise<Transfer[]> {
    return [...this.transfers.values()];
  }

  async activeTransferForTicket(ticketId: string): Promise<Transfer | undefined> {
    return [...this.transfers.values()].find(
      (x) => x.ticketId === ticketId && (x.status === "PENDING" || x.status === "ESCROW")
    );
  }

  async createTransfer(transfer: Transfer): Promise<Transfer> {
    this.transfers.set(transfer.id, transfer);
    return transfer;
  }

  async updateTransfer(transfer: Transfer): Promise<Transfer> {
    this.transfers.set(transfer.id, transfer);
    return transfer;
  }

  // -------- validazioni / varchi ----------------------------------------------
  async listValidations(): Promise<Validation[]> {
    return [...this.validations.values()];
  }

  async validationsByEvent(eventId: string): Promise<Validation[]> {
    return [...this.validations.values()].filter((v) => {
      const ticket = this.tickets.get(v.ticketId);
      return !!ticket && ticket.eventId === eventId;
    });
  }

  async createValidation(validation: Validation): Promise<Validation> {
    this.validations.set(validation.id, validation);
    return validation;
  }

  async validatorsByEvent(eventId: string): Promise<Validator[]> {
    return [...this.validators.values()].filter((g) => g.eventId === eventId);
  }

  async createValidator(validator: Validator): Promise<Validator> {
    this.validators.set(validator.id, validator);
    return validator;
  }

  // -------- pagamenti ---------------------------------------------------------
  async getPayment(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async paymentByProviderRef(ref: string): Promise<Payment | undefined> {
    return [...this.payments.values()].find((p) => p.providerRef === ref);
  }

  async createPayment(payment: Payment): Promise<Payment> {
    this.payments.set(payment.id, payment);
    return payment;
  }

  async updatePayment(payment: Payment): Promise<Payment> {
    this.payments.set(payment.id, payment);
    return payment;
  }

  // -------- registrazioni email (OTP) -----------------------------------------
  async getPendingRegistration(email: string): Promise<PendingRegistration | undefined> {
    return this.pendingRegistrations.get(email);
  }

  async setPendingRegistration(pending: PendingRegistration): Promise<PendingRegistration> {
    this.pendingRegistrations.set(pending.email, pending);
    return pending;
  }

  async deletePendingRegistration(email: string): Promise<void> {
    this.pendingRegistrations.delete(email);
  }

  // -------- idempotenza webhook ----------------------------------------------
  async hasProcessedWebhook(id: string): Promise<boolean> {
    return this.processedWebhooks.has(id);
  }

  async markProcessedWebhook(id: string): Promise<void> {
    this.processedWebhooks.add(id);
  }

  // -------- ledger di piattaforma --------------------------------------------
  async getLedger(): Promise<Ledger> {
    return {...this.ledger};
  }

  async addToLedger(delta: Partial<Ledger>): Promise<Ledger> {
    if (delta.presaleCommissionCents) this.ledger.presaleCommissionCents += delta.presaleCommissionCents;
    if (delta.royaltyTinftCents) this.ledger.royaltyTinftCents += delta.royaltyTinftCents;
    if (delta.royaltyOrganizerCents) this.ledger.royaltyOrganizerCents += delta.royaltyOrganizerCents;
    if (delta.exitFeeCents) this.ledger.exitFeeCents += delta.exitFeeCents;
    return {...this.ledger};
  }

  // -------- contenuti editoriali ---------------------------------------------
  async listArtists(): Promise<Artist[]> {
    return [...this.artists.values()];
  }

  async getArtist(id: string): Promise<Artist | undefined> {
    return this.artists.get(id);
  }

  async updateArtist(artist: Artist): Promise<Artist> {
    this.artists.set(artist.id, artist);
    return artist;
  }

  async listBlogPosts(): Promise<BlogPost[]> {
    return [...this.blogPosts.values()];
  }

  async blogBySlug(slug: string): Promise<BlogPost | undefined> {
    return [...this.blogPosts.values()].find((p) => p.slug === slug);
  }

  async listNews(): Promise<News[]> {
    return [...this.news.values()];
  }

  async seedContent(): Promise<void> {
    if (this.artists.size > 0 || this.blogPosts.size > 0 || this.news.size > 0) return;
    this.seedContentSync();
  }

  /** Seed dei contenuti editoriali (artisti, blog, news) per la home del sito. */
  private seedContentSync(): void {
    const palette = ["#2f4f8a", "#0a8a5c", "#9c5e00", "#7a3550"];
    const artists: Array<Omit<Artist, "id">> = [
      {name: "Charlotte de Witte", genre: "Techno", initials: "CW", color: palette[0]!, followers: 12840},
      {name: "Adam Beyer", genre: "Techno", initials: "AB", color: palette[1]!, followers: 9760},
      {name: "Mind Against", genre: "Melodic", initials: "MA", color: palette[2]!, followers: 6420},
      {name: "Blue Room Quartet", genre: "Jazz", initials: "BR", color: palette[3]!, followers: 2150}
    ];
    for (const a of artists) {
      const id = this.id("art");
      this.artists.set(id, {id, ...a});
    }

    const posts: Array<Omit<BlogPost, "id">> = [
      {
        slug: "guida-acquisto-biglietti-nft",
        tag: "GUIDA",
        title: "Come acquistare un biglietto NFT su TINFT",
        excerpt: "Dalla registrazione SPID al wallet: il percorso completo per il tuo primo biglietto.",
        readMins: 5
      },
      {
        slug: "dietro-le-quinte-mint-on-chain",
        tag: "DIETRO LE QUINTE",
        title: "Dietro le quinte: come funziona il mint on-chain",
        excerpt: "Cosa succede quando paghi: escrow, mint del token e ledger di piattaforma.",
        readMins: 7
      },
      {
        slug: "mercato-secondario-tetto-prezzo",
        tag: "MERCATO",
        title: "Mercato secondario: il tetto +10% e la royalty",
        excerpt: "Rivendere senza secondary selvaggio: regole, royalty 1% e protezione del fan.",
        readMins: 4
      }
    ];
    for (const p of posts) {
      const id = this.id("post");
      this.blogPosts.set(id, {id, ...p});
    }

    const news: Array<Omit<News, "id">> = [
      {date: "2026-05-02", title: "TINFT apre le vendite per la stagione estiva"},
      {date: "2026-05-18", title: "Nuovi club partner a Milano e Bologna"},
      {date: "2026-06-01", title: "Aggiornamento: export libero con fee d'uscita 25%"},
      {date: "2026-06-10", title: "Charlotte de Witte annuncia una data esclusiva"}
    ];
    for (const n of news) {
      const id = this.id("news");
      this.news.set(id, {id, ...n});
    }
  }

  /** Snapshot serializzabile dell'intero store (persistenza su file del prototipo). */
  snapshot(): StoreSnapshot {
    const e = <V>(m: Map<string, V>): [string, V][] => [...m.entries()];
    return {
      accounts: e(this.accounts), clubs: e(this.clubs), events: e(this.events), tiers: e(this.tiers),
      orders: e(this.orders), tickets: e(this.tickets), transfers: e(this.transfers),
      validations: e(this.validations), validators: e(this.validators), payments: e(this.payments),
      pendingRegistrations: e(this.pendingRegistrations), artists: e(this.artists),
      blogPosts: e(this.blogPosts), news: e(this.news),
      processedWebhooks: [...this.processedWebhooks], ledger: {...this.ledger},
      seq: {...this.seq}, tokenSeq: this.tokenSeq
    };
  }

  /** Ripristina lo store da uno snapshot (sostituisce il contenuto corrente). */
  restore(s: StoreSnapshot): void {
    const load = <V>(m: Map<string, V>, arr?: [string, V][]): void => {
      m.clear();
      for (const [k, v] of arr ?? []) m.set(k, v);
    };
    load(this.accounts, s.accounts); load(this.clubs, s.clubs); load(this.events, s.events);
    load(this.tiers, s.tiers); load(this.orders, s.orders); load(this.tickets, s.tickets);
    load(this.transfers, s.transfers); load(this.validations, s.validations);
    load(this.validators, s.validators); load(this.payments, s.payments);
    load(this.pendingRegistrations, s.pendingRegistrations); load(this.artists, s.artists);
    load(this.blogPosts, s.blogPosts); load(this.news, s.news);
    this.processedWebhooks.clear();
    for (const w of s.processedWebhooks ?? []) this.processedWebhooks.add(w);
    if (s.ledger) Object.assign(this.ledger, s.ledger);
    if (s.seq) this.seq = s.seq;
    if (typeof s.tokenSeq === "number") this.tokenSeq = s.tokenSeq;
  }
}

/** Forma serializzabile dello store (snapshot/restore su file). */
export interface StoreSnapshot {
  accounts: [string, Account][];
  clubs: [string, Club][];
  events: [string, Event][];
  tiers: [string, Tier][];
  orders: [string, Order][];
  tickets: [string, Ticket][];
  transfers: [string, Transfer][];
  validations: [string, Validation][];
  validators: [string, Validator][];
  payments: [string, Payment][];
  pendingRegistrations: [string, PendingRegistration][];
  artists: [string, Artist][];
  blogPosts: [string, BlogPost][];
  news: [string, News][];
  processedWebhooks: string[];
  ledger: Ledger;
  seq: Record<string, number>;
  tokenSeq: number;
}
