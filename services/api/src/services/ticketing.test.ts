import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {exitFeeCents} from "../domain/rules";

const PRICE = 10_000; // €100,00

function setup(start = 1000) {
  const store = new MemoryStore();
  const clock = {t: start};
  const service = new TicketingService(store, () => clock.t);
  const org = service.createAccount({role: "ORGANIZER", nome: "Org", cognome: "Anizer", email: "org@tinft.io"});
  const event = service.createEvent({organizerId: org.id, title: "Vol.4", venue: "Magazzino", date: "21 GIU", priceCents: PRICE, capacity: 100});
  return {store, service, clock, org, event};
}

function client(service: TicketingService, name: string, cf?: string) {
  return service.createAccount({nome: name, cognome: "Test", email: `${name}@e.it`, cfHash: cf});
}

describe("TicketingService", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("acquisto primario crea un biglietto e incrementa il venduto", () => {
    const buyer = client(s.service, "marco", "idMarco");
    const t = s.service.purchasePrimary(s.event.id, buyer.id);
    expect(t.status).toBe("ACTIVE");
    expect(t.originalPriceCents).toBe(PRICE);
    expect(t.paidCents).toBe(PRICE);
    expect(s.service.getEvent(s.event.id).sold).toBe(1);
  });

  it("applica il limite 2/evento per identità (R4)", () => {
    const buyer = client(s.service, "marco", "idMarco");
    s.service.purchasePrimary(s.event.id, buyer.id);
    s.service.purchasePrimary(s.event.id, buyer.id);
    expect(() => s.service.purchasePrimary(s.event.id, buyer.id)).toThrowError(/max 2/);
  });

  it("rifiuta la rivendita oltre il tetto +5% e calcola la royalty (R2/R1)", () => {
    const seller = client(s.service, "sara", "idSara");
    const t = s.service.purchasePrimary(s.event.id, seller.id); // paid = PRICE
    expect(() => s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 10_501})).toThrowError(/tetto/);
    const xfer = s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 10_500});
    expect(xfer.status).toBe("ESCROW");
    expect(xfer.royaltyCents).toBe(100); // 1% di PRICE
    expect(xfer.royaltyTinftCents).toBe(50);
    expect(xfer.royaltyOrganizerCents).toBe(50);
    expect(s.service.getEvent(s.event.id)).toBeDefined();
  });

  it("alla vendita il token passa al compratore e il costo base lo segue (R3)", () => {
    const seller = client(s.service, "sara", "idSara");
    const buyer = client(s.service, "luca", "idLuca");
    const t = s.service.purchasePrimary(s.event.id, seller.id);
    const xfer = s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000});
    s.service.acceptTransfer(xfer.id, buyer.id);
    const updated = s.service.ticketsOf(buyer.id)[0]!;
    expect(updated.ownerId).toBe(buyer.id);
    expect(updated.paidCents).toBe(9_000); // nuovo costo base
    expect(updated.status).toBe("ACTIVE");
  });

  it("la vendita rispetta il limite 2/evento del compratore", () => {
    const seller = client(s.service, "sara", "idSara");
    const buyer = client(s.service, "luca", "idLuca");
    s.service.purchasePrimary(s.event.id, buyer.id);
    s.service.purchasePrimary(s.event.id, buyer.id); // buyer già a 2
    const t = s.service.purchasePrimary(s.event.id, seller.id);
    const xfer = s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000});
    expect(() => s.service.acceptTransfer(xfer.id, buyer.id)).toThrowError(/max 2/);
  });

  it("reclaim: prima del ttl solo il venditore, dopo il ttl chiunque", () => {
    const seller = client(s.service, "sara", "idSara");
    const t = s.service.purchasePrimary(s.event.id, seller.id);
    const xfer = s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000, ttlSeconds: 600});
    expect(() => s.service.reclaimTransfer(xfer.id, "estraneo")).toThrowError(/scaduto/);
    s.clock.t += 601;
    const r = s.service.reclaimTransfer(xfer.id, "estraneo");
    expect(r.status).toBe("RECLAIMED");
    expect(s.service.ticketsOf(seller.id)[0]!.status).toBe("ACTIVE");
  });

  it("validazione: VALID→USED, poi DUPLICATE; in escrow ESCROW; inesistente FAKE; screenshot", () => {
    const buyer = client(s.service, "marco", "idMarco");
    const t = s.service.purchasePrimary(s.event.id, buyer.id);
    expect(s.service.validate(t.id).outcome).toBe("VALID");
    expect(s.store.tickets.get(t.id)!.status).toBe("USED");
    expect(s.service.validate(t.id).outcome).toBe("DUPLICATE");
    expect(s.service.validate("inesistente").outcome).toBe("FAKE");

    const t2 = s.service.purchasePrimary(s.event.id, client(s.service, "giulia", "idGiulia").id);
    s.service.createTransfer(t2.id, t2.ownerId, {mode: "PAYMENT", priceCents: 9_000});
    expect(s.service.validate(t2.id).outcome).toBe("ESCROW");
    expect(s.service.validate(t.id, undefined, "screenshot").outcome).toBe("SCREENSHOT");
  });

  it("export: free incassa la fee 25%, enforced no; richiede biglietto usato; una sola volta", () => {
    const buyer = client(s.service, "marco", "idMarco");
    const t = s.service.purchasePrimary(s.event.id, buyer.id);
    expect(() => s.service.exportTicket(t.id, buyer.id, "FREE")).toThrowError(/concluso/);
    s.service.validate(t.id); // USED
    const exported = s.service.exportTicket(t.id, buyer.id, "FREE");
    expect(exported.exportMode).toBe("FREE");
    expect(exported.exitFeeCents).toBe(exitFeeCents(PRICE)); // 2500
    expect(exported.status).toBe("EXPORTED");
    expect(() => s.service.exportTicket(t.id, buyer.id, "ENFORCED")).toThrowError(/esportato/);
  });
});
