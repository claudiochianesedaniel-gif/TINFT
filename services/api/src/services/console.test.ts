import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {ConsoleService} from "./console";

const PRICE = 3_150;

function setup(start = 1000) {
  const store = new MemoryStore();
  const clock = {t: start};
  const service = new TicketingService(store, () => clock.t);
  const consoleSvc = new ConsoleService(store);
  const org = service.createAccount({role: "ORGANIZER", nome: "Org", cognome: "X", email: "org@e.it"});
  const event = service.createEvent({organizerId: org.id, title: "Vol.4", venue: "V", date: "21 GIU", priceCents: PRICE, capacity: 100});
  return {store, service, consoleSvc, clock, org, event};
}

function client(service: TicketingService, name: string, cf?: string) {
  return service.createAccount({nome: name, cognome: "T", email: `${name}@e.it`, cfHash: cf});
}

describe("Console organizzatore — dashboard (B6)", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("dashboard aggrega gross, venduti, eventi on-sale, validati e royalty org", () => {
    const buyer = client(s.service, "marco", "idMarco");
    s.service.payOrder(s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2}).id);

    let d = s.consoleSvc.dashboard(s.org.id);
    expect(d.ticketsSold).toBe(2);
    expect(d.grossCents).toBe(PRICE * 2); // 6300
    expect(d.eventsOnSale).toBe(1);
    expect(d.validated).toBe(0);
    expect(d.royaltyOrganizerCents).toBe(0);

    // valida un biglietto dell'org
    const tkt = s.service.ticketsOf(buyer.id)[0]!;
    s.service.validate(tkt.id);
    d = s.consoleSvc.dashboard(s.org.id);
    expect(d.validated).toBe(1);
  });

  it("royaltyOrganizerCents somma solo i transfer DONE degli eventi dell'org", () => {
    const seller = client(s.service, "sara", "idSara");
    const buyer = client(s.service, "luca", "idLuca");
    const t = s.service.payOrder(s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1}).id).ticketIds[0]!;
    s.service.listTicket(t, seller.id, 3_000);
    s.service.buyFromMarket(t, buyer.id); // royalty 1% di 3150 = 31 → org 16

    const d = s.consoleSvc.dashboard(s.org.id);
    expect(d.royaltyOrganizerCents).toBe(16);
  });

  it("dashboard è scoped per organizzatore (ignora eventi di altri)", () => {
    const other = s.service.createAccount({role: "ORGANIZER", nome: "Altro", cognome: "Y", email: "o2@e.it"});
    const ev2 = s.service.createEvent({organizerId: other.id, title: "X", venue: "V", date: "D", priceCents: 5_000, capacity: 10});
    const buyer = client(s.service, "marco", "idMarco");
    s.service.payOrder(s.service.createOrder({buyerId: buyer.id, eventId: ev2.id, quantity: 1}).id);

    // l'org del setup non ha venduto nulla
    expect(s.consoleSvc.dashboard(s.org.id).grossCents).toBe(0);
    expect(s.consoleSvc.dashboard(other.id).grossCents).toBe(5_000);
  });

  it("dashboard di un account inesistente → NOT_FOUND", () => {
    expect(() => s.consoleSvc.dashboard("acc_999")).toThrowError(/non trovato/);
  });
});

describe("Console organizzatore — incassi (B6)", () => {
  it("netCents = gross + royalty org (nessuna trattenuta TINFT sul primario)", () => {
    const s = setup();
    const seller = client(s.service, "sara", "idSara");
    const buyer = client(s.service, "luca", "idLuca");
    // 1 vendita primaria, poi rivendita: gross resta sui venduti, royalty org +16
    const t = s.service.payOrder(s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1}).id).ticketIds[0]!;
    s.service.listTicket(t, seller.id, 3_000);
    s.service.buyFromMarket(t, buyer.id);

    const inc = s.consoleSvc.incassi(s.org.id);
    expect(inc.grossCents).toBe(PRICE); // 3150
    expect(inc.royaltyOrganizerCents).toBe(16);
    expect(inc.netCents).toBe(PRICE + 16);
    expect(inc.nextPayoutCents).toBe(PRICE + 16);
    expect(inc.payoutEta).toBe("entro 72h dalla fine evento");
  });
});

describe("Console organizzatore — accessi live (B6)", () => {
  it("specchio read-only delle validazioni, più recenti per prime", () => {
    const s = setup();
    const buyer = client(s.service, "marco", "idMarco");
    s.service.payOrder(s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2}).id);
    const [t1, t2] = s.service.ticketsOf(buyer.id);

    s.clock.t = 2000;
    s.service.validate(t1!.id);
    s.clock.t = 3000;
    s.service.validate(t2!.id);

    const acc = s.consoleSvc.eventAccess(s.event.id);
    expect(acc.capacity).toBe(100);
    expect(acc.validated).toBe(2);
    expect(acc.recentEntries).toHaveLength(2);
    expect(acc.recentEntries[0]!.at).toBe(3000); // più recente prima
    expect(acc.recentEntries[0]!.outcome).toBe("VALID");
    expect(acc.recentEntries[0]!.holderName).toContain("marco");
  });

  it("accessi su evento inesistente → NOT_FOUND", () => {
    const s = setup();
    expect(() => s.consoleSvc.eventAccess("evt_999")).toThrowError(/non trovato/);
  });
});

describe("Varchi / validatori (B6)", () => {
  it("crea un varco VARCO-#### (solo l'org proprietario) e li elenca", () => {
    const s = setup();
    const gate = s.service.createValidator(s.event.id, s.org.id);
    expect(gate.code).toMatch(/^VARCO-\d{4}$/);
    expect(gate.eventId).toBe(s.event.id);
    expect(s.service.listValidators(s.event.id)).toHaveLength(1);

    const other = client(s.service, "estraneo");
    expect(() => s.service.createValidator(s.event.id, other.id)).toThrowError(/organizzatore/);
  });
});

describe("Console piattaforma — revenue (B6)", () => {
  it("ricava i totali dal ledger dopo order pay + market buy + export libero", () => {
    const s = setup();
    const seller = client(s.service, "sara", "idSara");
    const buyer = client(s.service, "luca", "idLuca");

    // primario: presale 10% di 3150 = 315
    const ticketId = s.service.payOrder(s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1}).id).ticketIds[0]!;
    // secondario: royalty 1% di 3150 = 31 → TINFT 15
    s.service.listTicket(ticketId, seller.id, 3_000);
    s.service.buyFromMarket(ticketId, buyer.id);
    // export libero: 25% di 3150 = 787 (serve biglietto USED)
    s.service.validate(ticketId);
    s.service.exportTicket(ticketId, buyer.id, "FREE");

    const rev = s.consoleSvc.platformRevenue();
    expect(rev.presaleCommissionCents).toBe(315);
    expect(rev.royaltyTinftCents).toBe(15);
    expect(rev.exitFeeCents).toBe(787);
    expect(rev.totalCents).toBe(315 + 15 + 787);
    expect(rev.gmvPrimaryCents).toBe(PRICE); // 1 venduto
    expect(rev.p2pCount).toBe(1); // 1 transfer PAYMENT/DONE
  });
});
