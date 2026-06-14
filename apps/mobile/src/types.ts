// Tipi condivisi che rispecchiano le risposte dell'API TINFT (services/api).

export type AccountRole = "CLIENTE" | "ORGANIZER" | "VALIDATOR" | "PLATFORM";

export type TicketStatus = "ACTIVE" | "LISTED" | "USED" | "EXPORTED";

/** I 5 esiti di una scansione/validazione (enforced lato server). */
export type ValidationOutcome = "VALID" | "SCREENSHOT" | "DUPLICATE" | "ESCROW" | "FAKE";

export interface Account {
  id: string;
  role: AccountRole;
  nome: string;
  cognome: string;
  email: string;
  verified?: boolean;
  walletAddress?: string;
  goodwill?: number;
}

export interface Ticket {
  id: string;
  eventId: string;
  ownerId: string;
  tokenId: number;
  originalPriceCents: number;
  paidCents: number;
  status: TicketStatus;
  holderName: string;
  kind?: "EVENT" | "FIDELITY";
  clubId?: string;
  uses?: number;
  used?: number;
  txHash?: string;
}

/** Risposta di POST /auth/login. */
export interface LoginResponse {
  token: string;
  account: Account;
}

/** Risposta di GET /tickets/:id/access-token. */
export interface AccessTokenResponse {
  token: string;
  exp: number; // epoch seconds di scadenza
  rotateSeconds: number; // ogni quanti secondi ruotare il QR
}

/** Risposta di POST /validate/scan. */
export interface ScanResult {
  outcome: ValidationOutcome;
  holderName?: string;
  meta?: {
    ticketId?: string;
    eventId?: string;
    tokenId?: number;
    [k: string]: unknown;
  };
}
