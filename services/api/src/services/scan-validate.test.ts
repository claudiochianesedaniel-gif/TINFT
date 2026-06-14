import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {signAccessToken} from "../access/access-token";

const PRICE = 10_000; // €100,00

async function setup() {
  const store = new MemoryStore();
  const service = new TicketingService(store);
  const org = await service.createAccount({role: "ORGANIZER", nome: "Org", cognome: "Anizer", email: "org@tinft.io"});
  const event = await service.createEvent({
    organizerId: org.id,
    title: "Vol.4",
    venue: "Magazzino",
    date: "21 GIU",
    priceCents: PRICE,
    capacity: 100
  });
  return {store, service, org, event};
}

function client(service: TicketingService, name: string, cf?: string) {
  return service.createAccount({nome: name, cognome: "Test", email: `${name}@e.it`, cfHash: cf});
}

describe("TicketingService.scanValidate", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("token fresco di un biglietto ACTIVE → VALID e il biglietto diventa USED; di nuovo → DUPLICATE", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const t = await s.service.purchasePrimary(s.event.id, buyer.id);
    const token = signAccessToken(t.id);

    const first = await s.service.scanValidate(token);
    expect(first.outcome).toBe("VALID");
    expect(first.holderName).toBe(t.holderName);
    expect(first.meta?.ticketId).toBe(t.id);
    expect(s.store.tickets.get(t.id)!.status).toBe("USED");

    const second = await s.service.scanValidate(signAccessToken(t.id));
    expect(second.outcome).toBe("DUPLICATE");
  });

  it("token scaduto → SCREENSHOT (e non muta il biglietto)", async () => {
    const buyer = await client(s.service, "sara", "idSara");
    const t = await s.service.purchasePrimary(s.event.id, buyer.id);
    const expired = signAccessToken(t.id, -10);
    const res = await s.service.scanValidate(expired);
    expect(res.outcome).toBe("SCREENSHOT");
    expect(s.store.tickets.get(t.id)!.status).toBe("ACTIVE"); // intatto
  });

  it("token spazzatura/manomesso → FAKE", async () => {
    expect((await s.service.scanValidate("non-un-token")).outcome).toBe("FAKE");
    expect((await s.service.scanValidate("")).outcome).toBe("FAKE");
  });

  it("token valido di un biglietto inesistente → FAKE", async () => {
    const token = signAccessToken("tkt_inesistente");
    expect((await s.service.scanValidate(token)).outcome).toBe("FAKE");
  });

  it("token di un biglietto LISTED (in vendita/trasferimento) → ESCROW", async () => {
    const seller = await client(s.service, "luca", "idLuca");
    const t = await s.service.purchasePrimary(s.event.id, seller.id);
    await s.service.createTransfer(t.id, seller.id, {mode: "PAYMENT", priceCents: 9_000}); // ticket → LISTED
    const res = await s.service.scanValidate(signAccessToken(t.id));
    expect(res.outcome).toBe("ESCROW");
  });
});
