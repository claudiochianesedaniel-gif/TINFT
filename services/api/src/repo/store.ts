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
 * Interfaccia di persistenza TINFT — superficie ASINCRONA su cui dipendono i
 * servizi applicativi (TicketingService, PaymentsService, ConsoleService,
 * ContentService). Due implementazioni:
 *   - {@link ../repo/memory.MemoryStore}  → in-memory (default del prototipo, snapshot su file)
 *   - {@link ../repo/prisma-store.PrismaStore} → PostgreSQL via PrismaClient (DATABASE_URL)
 *
 * Si espongono metodi espliciti per entità (niente Map grezze) così che il
 * PrismaStore possa implementarli; gli oggetti di dominio restituiti sono quelli
 * di src/domain/models.ts (importi in centesimi interi; tokenId number).
 *
 * IMPORTANTE: i metodi `get*`/`list*` NON devono restituire riferimenti vivi alle
 * strutture interne quando ciò comporterebbe mutazioni implicite; i servizi
 * persistono ogni mutazione chiamando esplicitamente `update*`.
 */
export interface Store {
  // -------- generatori di id --------------------------------------------------
  /** Id locale con prefisso (es. "acc_..."), sincrono. */
  id(prefix: string): string;
  /** Prossimo tokenId on-chain (monotono crescente). */
  nextTokenId(): Promise<number>;

  // -------- account -----------------------------------------------------------
  getAccount(id: string): Promise<Account | undefined>;
  getAccountByEmail(email: string): Promise<Account | undefined>;
  listAccounts(): Promise<Account[]>;
  createAccount(account: Account): Promise<Account>;
  updateAccount(account: Account): Promise<Account>;
  deleteAccount(id: string): Promise<void>;

  // -------- club --------------------------------------------------------------
  getClub(id: string): Promise<Club | undefined>;
  listClubs(): Promise<Club[]>;
  /** Club che condividono un account Stripe connesso (per il webhook account.updated). */
  clubsByStripeAccount(stripeAccountId: string): Promise<Club[]>;
  createClub(club: Club): Promise<Club>;
  updateClub(club: Club): Promise<Club>;

  // -------- lock per-chiave ----------------------------------------------------
  /**
   * Esegue `fn` in mutua esclusione sulla chiave (es. `ord:<orderId>`, `val:<ticketId>`).
   * MemoryStore: mutex in-processo (singola istanza). PrismaStore: advisory lock
   * transazionale Postgres → serializza anche TRA istanze (scale-out): il punto 9
   * di DEV-HANDOFF / FASE 7 del TODO.
   */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;

  // -------- eventi ------------------------------------------------------------
  getEvent(id: string): Promise<Event | undefined>;
  /** Lookup per codice varco (già normalizzato); undefined se nessun evento lo usa. */
  getEventByGateCode(code: string): Promise<Event | undefined>;
  listEvents(): Promise<Event[]>;
  eventsByOrganizer(organizerId: string): Promise<Event[]>;
  eventsByClub(clubId: string): Promise<Event[]>;
  createEvent(event: Event): Promise<Event>;
  updateEvent(event: Event): Promise<Event>;

  // -------- tier --------------------------------------------------------------
  getTier(id: string): Promise<Tier | undefined>;
  tiersByEvent(eventId: string): Promise<Tier[]>;
  createTier(tier: Tier): Promise<Tier>;
  updateTier(tier: Tier): Promise<Tier>;

  // -------- ordini ------------------------------------------------------------
  getOrder(id: string): Promise<Order | undefined>;
  ordersByBuyer(buyerId: string): Promise<Order[]>;
  createOrder(order: Order): Promise<Order>;
  updateOrder(order: Order): Promise<Order>;
  /**
   * Evade un ordine in modo ATOMICO e idempotente: lega i biglietti all'ordine,
   * accredita la commissione di prevendita al ledger e il goodwill al compratore e
   * porta l'ordine a PAID — tutto-o-niente. Se l'ordine è già PAID è un no-op
   * (ritorna lo stato corrente). Su store relazionali avviene in una transazione
   * con lock di riga sull'ordine: serializza consegne concorrenti dello stesso
   * ordine ed elimina la finestra di doppio accredito / crash a metà scrittura.
   */
  settleOrder(input: {
    orderId: string;
    ticketIds: string[];
    presaleCommissionCents: number;
    buyerId: string;
    goodwillDelta: number;
  }): Promise<Order>;

  // -------- biglietti ---------------------------------------------------------
  getTicket(id: string): Promise<Ticket | undefined>;
  ticketsByOwner(ownerId: string): Promise<Ticket[]>;
  ticketsByEvent(eventId: string): Promise<Ticket[]>;
  listedTickets(): Promise<Ticket[]>;
  /** Biglietti ACTIVE/LISTED controllati da un'identità (cfHash) per un evento (R4). */
  heldCountForIdentity(eventId: string, cfHash: string): Promise<number>;
  /** Biglietti ACTIVE/LISTED del compratore + trasferimenti in entrata pendenti (limite 3/evento). */
  heldForEventByBuyer(eventId: string, buyerId: string): Promise<number>;
  createTicket(ticket: Ticket): Promise<Ticket>;
  updateTicket(ticket: Ticket): Promise<Ticket>;
  deleteTicket(id: string): Promise<void>;

  // -------- trasferimenti -----------------------------------------------------
  getTransfer(id: string): Promise<Transfer | undefined>;
  listTransfers(): Promise<Transfer[]>;
  activeTransferForTicket(ticketId: string): Promise<Transfer | undefined>;
  createTransfer(transfer: Transfer): Promise<Transfer>;
  updateTransfer(transfer: Transfer): Promise<Transfer>;

  // -------- validazioni / varchi ----------------------------------------------
  listValidations(): Promise<Validation[]>;
  validationsByEvent(eventId: string): Promise<Validation[]>;
  createValidation(validation: Validation): Promise<Validation>;
  validatorsByEvent(eventId: string): Promise<Validator[]>;
  createValidator(validator: Validator): Promise<Validator>;

  // -------- pagamenti ---------------------------------------------------------
  getPayment(id: string): Promise<Payment | undefined>;
  paymentByProviderRef(ref: string): Promise<Payment | undefined>;
  createPayment(payment: Payment): Promise<Payment>;
  updatePayment(payment: Payment): Promise<Payment>;

  // -------- registrazioni email (OTP) -----------------------------------------
  getPendingRegistration(email: string): Promise<PendingRegistration | undefined>;
  setPendingRegistration(pending: PendingRegistration): Promise<PendingRegistration>;
  deletePendingRegistration(email: string): Promise<void>;

  // -------- idempotenza webhook ----------------------------------------------
  hasProcessedWebhook(id: string): Promise<boolean>;
  markProcessedWebhook(id: string): Promise<void>;

  // -------- ledger di piattaforma --------------------------------------------
  getLedger(): Promise<Ledger>;
  /** Somma i delta indicati al ledger e restituisce lo stato aggiornato. */
  addToLedger(delta: Partial<Ledger>): Promise<Ledger>;

  // -------- contenuti editoriali ---------------------------------------------
  listArtists(): Promise<Artist[]>;
  getArtist(id: string): Promise<Artist | undefined>;
  updateArtist(artist: Artist): Promise<Artist>;
  listBlogPosts(): Promise<BlogPost[]>;
  blogBySlug(slug: string): Promise<BlogPost | undefined>;
  listNews(): Promise<News[]>;
  /** Inserisce i contenuti editoriali di default se assenti (idempotente). */
  seedContent(): Promise<void>;
}
