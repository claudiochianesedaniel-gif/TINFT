import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {exitFeeCents} from "../domain/rules";

const PRICE = 10_000; // €100,00

async function setup(start = 1000) {
  const store = new MemoryStore();
  const clock = {t: start};
  const service = new TicketingService(store, () => clock.t);
  const org = await service.createAccount({role: "ORGANIZER", nome: "Org", cognome: "Anizer", email: "org@tinft.io"});
  const event = await service.createEvent({organizerId: org.id, title: "Vol.4", venue: "Magazzino", date: "21 GIU", priceCents: PRICE, capacity: 100});
  return {store, service, clock, org, event};
}

function client(service: TicketingService, name: string, cf?: string) {
  return service.createAccount({nome: name, cognome: "Test", email: `${name}@e.it`, cfHash: cf});
}

describe("TicketingService", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("acquisto primario crea un biglietto e incrementa il venduto", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const t = await s.service.purchasePrimary(s.event.id, buyer.id);
    expect(t.status).toBe("ACTIVE");
    expect(t.originalPriceCents).toBe(PRICE);
    expect(t.paidCents).toBe(PRICE);
    expect((await s.service.getEvent(s.event.id)).sold).toBe(1);
  });

  it("applica il limite 3/evento per identità (R4)", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    await s.service.purchasePrimary(s.event.id, buyer.id);
    await s.service.purchasePrimary(s.event.id, buyer.id);
    await s.service.purchasePrimary(s.event.id, buyer.id); // buyer già a 3
    await expect(s.service.purchasePrimary(s.event.id, buyer.id)).rejects.toThrowError(/max 3/);
  });

  it("rifiuta la rivendita oltre il tetto +5% e calcola la fee 1% (R2/R1): biglietto ATTIVO → tutta a TINFT", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const t = await s.service.purchasePrimary(s.event.id, seller.id); // paid = PRICE
    await expect(s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 10_501})).rejects.toThrowError(/tetto/);
    const xfer = await s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 10_500});
    expect(xfer.status).toBe("ESCROW");
    expect(xfer.royaltyCents).toBe(100); // 1% di PRICE
    // biglietto ATTIVO (evento non concluso): l'1% è TUTTO di TINFT
    expect(xfer.royaltyTinftCents).toBe(100);
    expect(xfer.royaltyOrganizerCents).toBe(0);
    expect(await s.service.getEvent(s.event.id)).toBeDefined();
  });

  it("rivendita post-evento (mero NFT, evento CONCLUDED): fee 1% con split 0,5/0,5", async () => {
    const seller = await client(s.service, "sara2", "idSara2");
    const t = await s.service.purchasePrimary(s.event.id, seller.id);
    const event = await s.service.getEvent(s.event.id);
    event.status = "CONCLUDED";
    await s.store.updateEvent(event);
    const xfer = await s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000});
    expect(xfer.royaltyCents).toBe(100);
    expect(xfer.royaltyTinftCents).toBe(50);
    expect(xfer.royaltyOrganizerCents).toBe(50);
  });

  it("alla vendita il token passa al compratore e il costo base lo segue (R3)", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const buyer = await client(s.service, "luca", "idLuca");
    const t = await s.service.purchasePrimary(s.event.id, seller.id);
    const xfer = await s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000});
    await s.service.acceptTransfer(xfer.id, buyer.id);
    const updated = (await s.service.ticketsOf(buyer.id))[0]!;
    expect(updated.ownerId).toBe(buyer.id);
    expect(updated.paidCents).toBe(9_000); // nuovo costo base
    expect(updated.status).toBe("ACTIVE");
  });

  it("la vendita rispetta il limite 3/evento del compratore", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const buyer = await client(s.service, "luca", "idLuca");
    await s.service.purchasePrimary(s.event.id, buyer.id);
    await s.service.purchasePrimary(s.event.id, buyer.id);
    await s.service.purchasePrimary(s.event.id, buyer.id); // buyer già a 3
    const t = await s.service.purchasePrimary(s.event.id, seller.id);
    const xfer = await s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000});
    await expect(s.service.acceptTransfer(xfer.id, buyer.id)).rejects.toThrowError(/max 3/);
  });

  it("reclaim: prima del ttl solo il venditore, dopo il ttl chiunque", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const t = await s.service.purchasePrimary(s.event.id, seller.id);
    const xfer = await s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000, ttlSeconds: 600});
    await expect(s.service.reclaimTransfer(xfer.id, "estraneo")).rejects.toThrowError(/scaduto/);
    s.clock.t += 601;
    const r = await s.service.reclaimTransfer(xfer.id, "estraneo");
    expect(r.status).toBe("RECLAIMED");
    expect((await s.service.ticketsOf(seller.id))[0]!.status).toBe("ACTIVE");
  });

  it("validazione: VALID→USED, poi DUPLICATE; in escrow ESCROW; inesistente FAKE; screenshot", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const t = await s.service.purchasePrimary(s.event.id, buyer.id);
    expect((await s.service.validate(t.id)).outcome).toBe("VALID");
    expect(s.store.tickets.get(t.id)!.status).toBe("USED");
    expect((await s.service.validate(t.id)).outcome).toBe("DUPLICATE");
    expect((await s.service.validate("inesistente")).outcome).toBe("FAKE");

    const t2 = await s.service.purchasePrimary(s.event.id, (await client(s.service, "giulia", "idGiulia")).id);
    await s.service.createTransfer(t2.id, t2.ownerId, {mode: "PAYMENT", priceCents: 9_000});
    expect((await s.service.validate(t2.id)).outcome).toBe("ESCROW");
    expect((await s.service.validate(t.id, undefined, "screenshot")).outcome).toBe("SCREENSHOT");
  });

  it("export: free incassa la fee 25%, enforced no; richiede biglietto usato; una sola volta", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const t = await s.service.purchasePrimary(s.event.id, buyer.id);
    await expect(s.service.exportTicket(t.id, buyer.id, "FREE")).rejects.toThrowError(/concluso/);
    await s.service.validate(t.id); // USED
    const exported = await s.service.exportTicket(t.id, buyer.id, "FREE");
    expect(exported.exportMode).toBe("FREE");
    expect(exported.exitFeeCents).toBe(exitFeeCents(PRICE)); // 2500
    expect(exported.status).toBe("EXPORTED");
    await expect(s.service.exportTicket(t.id, buyer.id, "ENFORCED")).rejects.toThrowError(/esportato/);
  });
});
