import type {Account, Club, Event, Ledger, Order, PendingRegistration, Ticket, Tier, Transfer, Validation} from "../domain/models";
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
  readonly payments = new Map<string, Payment>();
  readonly pendingRegistrations = new Map<string, PendingRegistration>();
  readonly processedWebhooks = new Set<string>();

  /** Ledger di piattaforma: ricavi (commissioni di prevendita, royalty, fee d'uscita). */
  readonly ledger: Ledger = {
    presaleCommissionCents: 0,
    royaltyTinftCents: 0,
    royaltyOrganizerCents: 0,
    exitFeeCents: 0
  };

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
}
