import type {Account, Event, Ticket, Transfer, Validation} from "../domain/models";

/**
 * Store in-memory: implementa la persistenza per i test e lo sviluppo locale.
 * In M6 (step successivo) verrà affiancato/sostituito da un adapter Prisma su
 * PostgreSQL; il servizio applicativo dipende solo da questa interfaccia di dati.
 */
export class MemoryStore {
  readonly accounts = new Map<string, Account>();
  readonly events = new Map<string, Event>();
  readonly tickets = new Map<string, Ticket>();
  readonly transfers = new Map<string, Transfer>();
  readonly validations = new Map<string, Validation>();

  private seq: Record<string, number> = {};
  private tokenSeq = 0;

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

  activeTransferForTicket(ticketId: string): Transfer | undefined {
    return [...this.transfers.values()].find(
      (x) => x.ticketId === ticketId && (x.status === "PENDING" || x.status === "ESCROW")
    );
  }
}
