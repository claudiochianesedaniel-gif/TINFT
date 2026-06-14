import {NotFound} from "../domain/models";
import type {Store} from "../repo/store";

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
  constructor(private readonly store: Store) {}

  // ----------------------------------------------------------- organizzatore
  async dashboard(organizerId: string): Promise<OrganizerDashboard> {
    await this.getOrganizer(organizerId);
    const events = await this.store.eventsByOrganizer(organizerId);
    const eventIds = new Set(events.map((e) => e.id));

    const grossCents = events.reduce((sum, e) => sum + e.sold * e.priceCents, 0);
    const ticketsSold = events.reduce((sum, e) => sum + e.sold, 0);
    const eventsOnSale = events.filter((e) => e.status === "ON_SALE").length;

    let validated = 0;
    for (const v of await this.store.listValidations()) {
      if (v.outcome !== "VALID") continue;
      const ticket = await this.store.getTicket(v.ticketId);
      if (ticket && eventIds.has(ticket.eventId)) validated++;
    }

    let royaltyOrganizerCents = 0;
    for (const x of await this.store.listTransfers()) {
      if (x.status !== "DONE") continue;
      const ticket = await this.store.getTicket(x.ticketId);
      if (ticket && eventIds.has(ticket.eventId)) royaltyOrganizerCents += x.royaltyOrganizerCents;
    }

    return {grossCents, ticketsSold, eventsOnSale, validated, royaltyOrganizerCents};
  }

  async incassi(organizerId: string): Promise<OrganizerIncassi> {
    const d = await this.dashboard(organizerId);
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
  async eventAccess(eventId: string): Promise<EventAccess> {
    const event = await this.store.getEvent(eventId);
    if (!event) throw NotFound("evento");

    const validations = await this.store.validationsByEvent(eventId);
    const validated = validations.filter((v) => v.outcome === "VALID").length;

    const ordered = [...validations].sort((a, b) => b.at - a.at).slice(0, 10);
    const recentEntries = [];
    for (const v of ordered) {
      const ticket = await this.store.getTicket(v.ticketId);
      recentEntries.push({holderName: ticket?.holderName ?? "—", outcome: v.outcome, at: v.at});
    }

    return {capacity: event.capacity, validated, recentEntries};
  }

  // -------------------------------------------------------------- piattaforma
  async platformRevenue(): Promise<PlatformRevenue> {
    const {presaleCommissionCents, royaltyTinftCents, exitFeeCents} = await this.store.getLedger();
    const totalCents = presaleCommissionCents + royaltyTinftCents + exitFeeCents;
    const events = await this.store.listEvents();
    const gmvPrimaryCents = events.reduce((sum, e) => sum + e.sold * e.priceCents, 0);
    const p2pCount = (await this.store.listTransfers()).filter(
      (x) => x.mode === "PAYMENT" && x.status === "DONE"
    ).length;
    return {presaleCommissionCents, royaltyTinftCents, exitFeeCents, totalCents, gmvPrimaryCents, p2pCount};
  }

  // ------------------------------------------------------------------ helper
  private async getOrganizer(id: string) {
    const a = await this.store.getAccount(id);
    if (!a) throw NotFound("account");
    return a;
  }
}
