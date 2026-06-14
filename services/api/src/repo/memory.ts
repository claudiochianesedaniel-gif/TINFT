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

/**
 * Store in-memory: implementa la persistenza per i test e lo sviluppo locale.
 * In M6 (step successivo) verrà affiancato/sostituito da un adapter Prisma su
 * PostgreSQL; il servizio applicativo dipende solo da questa interfaccia di dati.
 */
export class MemoryStore {
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
    this.seedContent();
  }

  /** Seed dei contenuti editoriali (artisti, blog, news) per la home del sito. */
  private seedContent(): void {
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
        title: "Mercato secondario: il tetto +5% e la royalty",
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

  id(prefix: string): string {
    this.seq[prefix] = (this.seq[prefix] ?? 0) + 1;
    return `${prefix}_${this.seq[prefix]}`;
  }

  nextTokenId(): number {
    return ++this.tokenSeq;
  }

  ticketsByOwner(ownerId: string): Ticket[] {
    return [...this.tickets.values()].filter((t) => t.ownerId === ownerId);
  }

  /** Biglietti "controllati" da un'identità (cfHash) per un evento (R4). */
  heldCountForIdentity(eventId: string, cfHash: string): number {
    const owners = new Set(
      [...this.accounts.values()].filter((a) => a.cfHash === cfHash).map((a) => a.id)
    );
    return [...this.tickets.values()].filter(
      (t) => t.eventId === eventId && owners.has(t.ownerId) && (t.status === "ACTIVE" || t.status === "LISTED")
    ).length;
  }

  tiersByEvent(eventId: string): Tier[] {
    return [...this.tiers.values()].filter((t) => t.eventId === eventId);
  }

  ordersByBuyer(buyerId: string): Order[] {
    return [...this.orders.values()].filter((o) => o.buyerId === buyerId);
  }

  listedTickets(): Ticket[] {
    return [...this.tickets.values()].filter((t) => t.status === "LISTED");
  }

  /**
   * Biglietti "controllati" da un account per un evento, ai fini del limite 2/evento
   * sugli ordini e sul mercato: biglietti ACTIVE o LISTED (esclusi USED/EXPORTED)
   * PIÙ eventuali trasferimenti in entrata ancora pendenti (PENDING/ESCROW) per l'evento.
   */
  heldForEventByBuyer(eventId: string, buyerId: string): number {
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

  activeTransferForTicket(ticketId: string): Transfer | undefined {
    return [...this.transfers.values()].find(
      (x) => x.ticketId === ticketId && (x.status === "PENDING" || x.status === "ESCROW")
    );
  }

  paymentByProviderRef(ref: string): Payment | undefined {
    return [...this.payments.values()].find((p) => p.providerRef === ref);
  }

  // -------- query per console organizzatore / piattaforma --------------------

  eventsByOrganizer(organizerId: string): Event[] {
    return [...this.events.values()].filter((e) => e.organizerId === organizerId);
  }

  blogBySlug(slug: string): BlogPost | undefined {
    return [...this.blogPosts.values()].find((p) => p.slug === slug);
  }

  validationsByEvent(eventId: string): Validation[] {
    return [...this.validations.values()].filter((v) => {
      const ticket = this.tickets.get(v.ticketId);
      return !!ticket && ticket.eventId === eventId;
    });
  }

  validatorsByEvent(eventId: string): Validator[] {
    return [...this.validators.values()].filter((g) => g.eventId === eventId);
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
