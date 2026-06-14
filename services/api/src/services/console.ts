import {NotFound} from "../domain/models";
import type {MemoryStore} from "../repo/memory";

export interface OrganizerDashboard {
  grossCents: number; // Σ(event.sold × event.priceCents) sugli eventi dell'org
  ticketsSold: number; // Σ event.sold
  eventsOnSale: number; // eventi in stato ON_SALE
  validated: number; // validazioni VALID dei biglietti degli eventi dell'org
  royaltyOrganizerCents: number; // quota organizzatore della royalty (transfer DONE)
}

export interface OrganizerIncassi {
  grossCents: number;
  royaltyOrganizerCents: number;
  netCents: number; // gross + royalty (niente trattenuta TINFT sul primario)
  nextPayoutCents: number; // demo = netCents
  payoutEta: string;
}

export interface EventAccess {
  capacity: number;
  validated: number;
  recentEntries: Array<{holderName: string; outcome: string; at: number}>;
}

export interface PlatformRevenue {
  presaleCommissionCents: number;
  royaltyTinftCents: number;
  exitFeeCents: number;
  totalCents: number; // presale + royaltyTinft + exit
  gmvPrimaryCents: number; // Σ(event.sold × event.priceCents) su TUTTI gli eventi
  p2pCount: number; // numero di transfer PAYMENT in stato DONE
}

/**
 * Console di sola lettura: cruscotti per l'organizzatore (dashboard, incassi,
 * accessi live) e per la piattaforma (ricavi dal ledger). Nessuna mutazione.
 */
export class ConsoleService {
  constructor(private readonly store: MemoryStore) {}

  // ----------------------------------------------------------- organizzatore
  dashboard(organizerId: string): OrganizerDashboard {
    this.getOrganizer(organizerId);
    const events = this.store.eventsByOrganizer(organizerId);
    const eventIds = new Set(events.map((e) => e.id));

    const grossCents = events.reduce((sum, e) => sum + e.sold * e.priceCents, 0);
    const ticketsSold = events.reduce((sum, e) => sum + e.sold, 0);
    const eventsOnSale = events.filter((e) => e.status === "ON_SALE").length;

    const validated = [...this.store.validations.values()].filter((v) => {
      if (v.outcome !== "VALID") return false;
      const ticket = this.store.tickets.get(v.ticketId);
      return !!ticket && eventIds.has(ticket.eventId);
    }).length;

    const royaltyOrganizerCents = [...this.store.transfers.values()].reduce((sum, x) => {
      if (x.status !== "DONE") return sum;
      const ticket = this.store.tickets.get(x.ticketId);
      if (!ticket || !eventIds.has(ticket.eventId)) return sum;
      return sum + x.royaltyOrganizerCents;
    }, 0);

    return {grossCents, ticketsSold, eventsOnSale, validated, royaltyOrganizerCents};
  }

  incassi(organizerId: string): OrganizerIncassi {
    const d = this.dashboard(organizerId);
    // Nessuna trattenuta TINFT sul primario: il compratore ha già pagato la prevendita 10%.
    const netCents = d.grossCents + d.royaltyOrganizerCents;
    return {
      grossCents: d.grossCents,
      royaltyOrganizerCents: d.royaltyOrganizerCents,
      netCents,
      nextPayoutCents: netCents,
      payoutEta: "entro 72h dalla fine evento"
    };
  }

  /** Accessi live (read-only): specchio delle validazioni dei biglietti dell'evento. */
  eventAccess(eventId: string): EventAccess {
    const event = this.store.events.get(eventId);
    if (!event) throw NotFound("evento");

    const validations = this.store.validationsByEvent(eventId);
    const validated = validations.filter((v) => v.outcome === "VALID").length;

    const recentEntries = [...validations]
      .sort((a, b) => b.at - a.at)
      .slice(0, 10)
      .map((v) => ({
        holderName: this.store.tickets.get(v.ticketId)?.holderName ?? "—",
        outcome: v.outcome,
        at: v.at
      }));

    return {capacity: event.capacity, validated, recentEntries};
  }

  // -------------------------------------------------------------- piattaforma
  platformRevenue(): PlatformRevenue {
    const {presaleCommissionCents, royaltyTinftCents, exitFeeCents} = this.store.ledger;
    const totalCents = presaleCommissionCents + royaltyTinftCents + exitFeeCents;
    const gmvPrimaryCents = [...this.store.events.values()].reduce((sum, e) => sum + e.sold * e.priceCents, 0);
    const p2pCount = [...this.store.transfers.values()].filter(
      (x) => x.mode === "PAYMENT" && x.status === "DONE"
    ).length;
    return {presaleCommissionCents, royaltyTinftCents, exitFeeCents, totalCents, gmvPrimaryCents, p2pCount};
  }

  // ------------------------------------------------------------------ helper
  private getOrganizer(id: string) {
    const a = this.store.accounts.get(id);
    if (!a) throw NotFound("account");
    return a;
  }
}
