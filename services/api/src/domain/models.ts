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

export interface Account {
  id: string;
  role: AccountRole;
  nome: string;
  cognome: string;
  email: string;
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
