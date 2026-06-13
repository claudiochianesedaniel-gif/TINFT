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
  cfHash?: string; // keccak256(CF + salt); presente = identità SPID verificata
  verified: boolean;
  walletAddress?: string;
  goodwill: number;
}

export interface Event {
  id: string;
  organizerId: string;
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
