// Modello di dominio (in-memory) — rispecchia prisma/schema.prisma.
// Importi monetari in centesimi di euro (interi).

export type AccountRole = "CLIENTE" | "ORGANIZER" | "VALIDATOR" | "PLATFORM";
export type EventType = "TICKET_NFT" | "FIDELITY" | "SPECIAL";
export type EventStatus = "DRAFT" | "ON_SALE" | "CONCLUDED";
export type TicketStatus = "ACTIVE" | "LISTED" | "USED" | "EXPORTED";
export type ExportMode = "NONE" | "FREE" | "ENFORCED";
export type TransferMode = "GIFT" | "PAYMENT";
export type TransferStatus = "PENDING" | "ESCROW" | "DONE" | "RECLAIMED";
export type ValidationOutcome = "VALID" | "SCREENSHOT" | "DUPLICATE" | "ESCROW" | "FAKE";
export type KycStatus = "NONE" | "PENDING" | "VERIFIED" | "REJECTED";

export interface Account {
  id: string;
  role: AccountRole;
  nome: string;
  cognome: string;
  email: string;
  // KYC dell'organizzatore (NONE di default): abilita la pubblicazione degli eventi
  kycStatus?: KycStatus;
  // dati SPID completi (in chiaro off-chain; on-chain solo l'hash del CF)
  cf?: string; // codice fiscale
  cfHash?: string; // keccak256(CF + salt); presente = identità verificata
  dateOfBirth?: string;
  placeOfBirth?: string;
  gender?: string;
  address?: string; // indirizzo di residenza
  city?: string;
  zip?: string;
  province?: string;
  phone?: string;
  verified: boolean;
  walletAddress?: string;
  goodwill: number;
}

export interface Club {
  id: string;
  organizerId: string;
  name: string;
  city: string;
  fidelityPriceCents: number; // 0 = nessun Fidelity
  fidelityUses: number; // ingressi del carnet, validi su tutti gli eventi del club
  // dati di fatturazione (opzionali) del club/esercente
  ragioneSociale?: string;
  piva?: string;
  sedeLegale?: string;
  pec?: string;
  sdi?: string; // codice destinatario SDI
  iban?: string;
  genre?: string; // genere musicale prevalente del locale
  color?: string; // colore identitario per la UI
}

export interface Event {
  id: string;
  organizerId: string;
  clubId?: string; // il Fidelity è del club; gli eventi appartengono al club
  title: string;
  venue: string;
  date: string;
  type: EventType;
  priceCents: number;
  capacity: number;
  sold: number;
  status: EventStatus;
}

export interface Ticket {
  id: string;
  eventId: string;
  ownerId: string;
  tokenId: number;
  originalPriceCents: number;
  paidCents: number;
  status: TicketStatus;
  exportMode: ExportMode;
  exitFeeCents: number;
  holderName: string;
  txHash?: string; // tx di mint on-chain
  kind?: "EVENT" | "FIDELITY"; // FIDELITY = carnet del club
  clubId?: string;
  uses?: number; // Fidelity: ingressi totali
  used?: number; // Fidelity: ingressi consumati
  askPriceCents?: number; // prezzo richiesto sul mercato secondario (status LISTED)
  market?: string; // etichetta mercato, es. "Re-Selling"
}

export interface Tier {
  id: string;
  eventId: string;
  name: string;
  priceCents: number;
  note?: string;
  soldOut: boolean;
}

export type OrderStatus = "PENDING" | "PAID" | "CANCELLED";

export interface Order {
  id: string;
  buyerId: string;
  eventId: string;
  tierId?: string;
  quantity: number;
  unitPriceCents: number;
  presaleCommissionCents: number; // commissione di prevendita 10% per biglietto (solo TINFT)
  feeTotalCents: number; // commissione di prevendita × quantità
  subtotalCents: number; // prezzo × quantità
  totalCents: number; // (prezzo + commissione) × quantità
  status: OrderStatus;
  ticketIds: string[];
  createdAt: number; // epoch seconds
}

/** Ledger di piattaforma (in-memory): ricavi prevendita, royalty e fee d'uscita. */
export interface Ledger {
  presaleCommissionCents: number; // commissioni di prevendita 10% (primario, solo TINFT)
  royaltyTinftCents: number; // quota TINFT della royalty 1% sul secondario (0,5%)
  royaltyOrganizerCents: number; // quota organizzatore della royalty 1% (0,5%)
  exitFeeCents: number; // fee d'uscita 25% sull'export libero
}

/** Registrazione email in attesa di verifica OTP (non ancora un account). */
export interface PendingRegistration {
  email: string;
  code: string;
  nome: string;
  cognome: string;
  cf: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  zip?: string;
  province?: string;
  phone?: string;
  username?: string;
  createdAt: number; // epoch seconds
}

export interface Transfer {
  id: string;
  ticketId: string;
  fromId: string;
  toId?: string;
  mode: TransferMode;
  priceCents: number;
  royaltyCents: number;
  royaltyTinftCents: number;
  royaltyOrganizerCents: number;
  status: TransferStatus;
  ttlSeconds: number;
  createdAt: number; // epoch seconds
}

export interface Validation {
  id: string;
  ticketId: string;
  validatorId?: string;
  outcome: ValidationOutcome;
  at: number;
}

/** Varco/gate di un evento: codice usato dai validatori in app. */
export interface Validator {
  id: string;
  eventId: string;
  code: string; // es. "VARCO-1234"
  createdAt: number; // epoch seconds
}

// -------- contenuti editoriali (artisti, blog, news) ----------------------

export interface Artist {
  id: string;
  name: string;
  genre: string;
  initials: string;
  color: string;
  followers: number;
}

export interface BlogPost {
  id: string;
  slug: string;
  tag: string;
  title: string;
  excerpt: string;
  readMins: number;
}

export interface News {
  id: string;
  date: string;
  title: string;
}

/** Errore di dominio con codice e status HTTP associato. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const NotFound = (what: string) => new DomainError("NOT_FOUND", `${what} non trovato`, 404);
