import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {GOODWILL_PER_TICKET, resaleCapCents} from "../domain/rules";

const PRICE = 3_150; // €31,50

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

describe("Tier (v2)", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("crea una fascia e la elenca; evento senza fasce → array vuoto", async () => {
    expect(await s.service.listTiers(s.event.id)).toEqual([]);
    const tier = await s.service.createTier(s.event.id, {organizerId: s.org.id, name: "VIP", priceCents: 5_000, note: "front row"});
    expect(tier.eventId).toBe(s.event.id);
    expect(tier.soldOut).toBe(false);
    expect(await s.service.listTiers(s.event.id)).toHaveLength(1);
  });

  it("solo l'organizzatore proprietario può creare una fascia", async () => {
    const other = await client(s.service, "estraneo");
    await expect(s.service.createTier(s.event.id, {organizerId: other.id, name: "X", priceCents: 100})).rejects.toThrowError(/organizzatore/);
  });

  it("il checkout usa il prezzo della fascia se indicata", async () => {
    const tier = await s.service.createTier(s.event.id, {organizerId: s.org.id, name: "VIP", priceCents: 5_000});
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, tierId: tier.id, quantity: 1});
    expect(order.unitPriceCents).toBe(5_000);
  });
});

describe("Ordini / checkout v2", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("totale = (prezzo + prevendita 10%) × qty (3150, qty 2 → 315, total 6930)", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2});
    expect(order.unitPriceCents).toBe(3_150);
    expect(order.presaleCommissionCents).toBe(315);
    expect(order.quantity).toBe(2);
    expect(order.subtotalCents).toBe(6_300);
    expect(order.feeTotalCents).toBe(630);
    expect(order.totalCents).toBe(6_930);
    expect(order.status).toBe("PENDING");
    expect(order.ticketIds).toEqual([]);
  });

  it("pay conia N biglietti, accredita goodwill e la commissione al ledger", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2});
    const paid = await s.service.payOrder(order.id);
    expect(paid.status).toBe("PAID");
    expect(paid.ticketIds).toHaveLength(2);
    expect(await s.service.ticketsOf(buyer.id)).toHaveLength(2);
    expect((await s.service.getEvent(s.event.id)).sold).toBe(2);
    expect(s.store.accounts.get(buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET * 2);
    expect(s.store.ledger.presaleCommissionCents).toBe(630);
    // i biglietti portano il prezzo di fascia come costo base
    expect(s.store.tickets.get(paid.ticketIds[0]!)!.paidCents).toBe(3_150);
  });

  it("rifiuta l'ordine se la quantità supera l'allowance residua (limite 3/evento)", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    await s.service.payOrder((await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1})).id); // 1 controllato
    await expect(s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 3})).rejects.toThrowError(/per evento/);
    // qty 2 rientra ancora (1+2=3)
    const ok = await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2});
    expect(ok.quantity).toBe(2);
  });

  it("pay è idempotente: un secondo pagamento non concia di nuovo", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1});
    const first = await s.service.payOrder(order.id);
    const second = await s.service.payOrder(order.id);
    expect(second).toEqual(first);
    expect(await s.service.ticketsOf(buyer.id)).toHaveLength(1);
    expect(s.store.accounts.get(buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET);
    expect(s.store.ledger.presaleCommissionCents).toBe(315);
  });
});

describe("Mercato secondario (v2)", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("list rifiutato oltre il tetto +10%", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const t = (await s.service.payOrder((await s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1})).id)).ticketIds[0]!;
    const cap = resaleCapCents(3_150); // 3465
    await expect(s.service.listTicket(t, seller.id, cap + 1)).rejects.toThrowError(/tetto/);
    const listed = await s.service.listTicket(t, seller.id, cap);
    expect(listed.status).toBe("LISTED");
    expect(listed.askPriceCents).toBe(cap);
    expect(listed.market).toBe("Re-Selling");
  });

  it("list + buy (biglietto ATTIVO): fee 1% TUTTA a TINFT al ledger, costo base trasferito, goodwill al venditore", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const buyer = await client(s.service, "luca", "idLuca");
    const t = (await s.service.payOrder((await s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1})).id)).ticketIds[0]!;
    await s.service.listTicket(t, seller.id, 3_000);
    const goodwillBefore = s.store.accounts.get(seller.id)!.goodwill; // include il goodwill d'acquisto

    const res = await s.service.buyFromMarket(t, buyer.id);
    // fee 1% di 3150 = 31 → biglietto ATTIVO: tutta a TINFT (organizzatore 0)
    expect(res.royalty).toEqual({tinftCents: 31, organizerCents: 0});
    expect(res.paidByBuyerCents).toBe(3_000 + 31);
    expect(res.ticket.ownerId).toBe(buyer.id);
    expect(res.ticket.paidCents).toBe(3_000); // costo base viaggia col token
    expect(res.ticket.status).toBe("ACTIVE");
    expect(res.ticket.askPriceCents).toBeUndefined();

    expect(s.store.ledger.royaltyTinftCents).toBe(31);
    expect(s.store.ledger.royaltyOrganizerCents).toBe(0);
    // goodwill venditore ~ euro: incremento round(3000/100) = 30
    expect(s.store.accounts.get(seller.id)!.goodwill - goodwillBefore).toBe(30);
    // transfer registrato PAYMENT/DONE con royalty
    const xfer = [...s.store.transfers.values()].find((x) => x.ticketId === t)!;
    expect(xfer.mode).toBe("PAYMENT");
    expect(xfer.status).toBe("DONE");
    expect(xfer.priceCents).toBe(3_000);
    expect(xfer.royaltyTinftCents).toBe(31);
  });

  it("buy post-evento (mero NFT, evento CONCLUDED): fee 1% con split 0,5/0,5 al ledger", async () => {
    const seller = await client(s.service, "sara3", "idSara3");
    const buyer = await client(s.service, "luca3", "idLuca3");
    const t = (await s.service.payOrder((await s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1})).id)).ticketIds[0]!;
    await s.service.listTicket(t, seller.id, 3_000);
    const event = await s.service.getEvent(s.event.id);
    event.status = "CONCLUDED";
    await s.store.updateEvent(event);

    const res = await s.service.buyFromMarket(t, buyer.id);
    // fee 1% di 3150 = 31 → mero NFT: split 15/16 (resto all\'organizzatore)
    expect(res.royalty).toEqual({tinftCents: 15, organizerCents: 16});
    expect(s.store.ledger.royaltyTinftCents).toBe(15);
    expect(s.store.ledger.royaltyOrganizerCents).toBe(16);
  });

  it("buy rispetta il limite 3/evento del compratore", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const buyer = await client(s.service, "luca", "idLuca");
    // buyer porta già 3 biglietti dell'evento
    await s.service.payOrder((await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 3})).id);
    const t = (await s.service.payOrder((await s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1})).id)).ticketIds[0]!;
    await s.service.listTicket(t, seller.id, 3_000);
    await expect(s.service.buyFromMarket(t, buyer.id)).rejects.toThrowError(/per evento/);
  });
});

describe("Registrazione email + OTP (v2)", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("codice errato rifiutato; codice giusto crea un account verificato", async () => {
    const {devCode} = await s.service.startEmailRegistration({
      nome: "Marco",
      cognome: "Bianchi",
      cf: "BNCMRC90A01F205X",
      email: "mb@e.it",
      city: "Milano"
    });
    expect(devCode).toMatch(/^\d{6}$/);
    await expect(s.service.verifyEmailRegistration("mb@e.it", "000000")).rejects.toThrowError(/codice/);

    const account = await s.service.verifyEmailRegistration("mb@e.it", devCode!);
    expect(account.role).toBe("CLIENTE");
    expect(account.verified).toBe(true);
    expect(account.cfHash).toMatch(/^0x/);
    expect(account.email).toBe("mb@e.it");
    // pending consumato: non riutilizzabile
    await expect(s.service.verifyEmailRegistration("mb@e.it", devCode!)).rejects.toThrowError(/codice/);
  });
});
