import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {GOODWILL_PER_TICKET, resaleCapCents} from "../domain/rules";

const PRICE = 3_150; // €31,50

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

describe("Tier (v2)", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("crea una fascia e la elenca; evento senza fasce → array vuoto", () => {
    expect(s.service.listTiers(s.event.id)).toEqual([]);
    const tier = s.service.createTier(s.event.id, {organizerId: s.org.id, name: "VIP", priceCents: 5_000, note: "front row"});
    expect(tier.eventId).toBe(s.event.id);
    expect(tier.soldOut).toBe(false);
    expect(s.service.listTiers(s.event.id)).toHaveLength(1);
  });

  it("solo l'organizzatore proprietario può creare una fascia", () => {
    const other = client(s.service, "estraneo");
    expect(() => s.service.createTier(s.event.id, {organizerId: other.id, name: "X", priceCents: 100})).toThrowError(/organizzatore/);
  });

  it("il checkout usa il prezzo della fascia se indicata", () => {
    const tier = s.service.createTier(s.event.id, {organizerId: s.org.id, name: "VIP", priceCents: 5_000});
    const buyer = client(s.service, "marco", "idMarco");
    const order = s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, tierId: tier.id, quantity: 1});
    expect(order.unitPriceCents).toBe(5_000);
  });
});

describe("Ordini / checkout v2", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("totale = (prezzo + prevendita 10%) × qty (3150, qty 2 → 315, total 6930)", () => {
    const buyer = client(s.service, "marco", "idMarco");
    const order = s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2});
    expect(order.unitPriceCents).toBe(3_150);
    expect(order.presaleCommissionCents).toBe(315);
    expect(order.quantity).toBe(2);
    expect(order.subtotalCents).toBe(6_300);
    expect(order.feeTotalCents).toBe(630);
    expect(order.totalCents).toBe(6_930);
    expect(order.status).toBe("PENDING");
    expect(order.ticketIds).toEqual([]);
  });

  it("pay conia N biglietti, accredita goodwill e la commissione al ledger", () => {
    const buyer = client(s.service, "marco", "idMarco");
    const order = s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2});
    const paid = s.service.payOrder(order.id);
    expect(paid.status).toBe("PAID");
    expect(paid.ticketIds).toHaveLength(2);
    expect(s.service.ticketsOf(buyer.id)).toHaveLength(2);
    expect(s.service.getEvent(s.event.id).sold).toBe(2);
    expect(s.store.accounts.get(buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET * 2);
    expect(s.store.ledger.presaleCommissionCents).toBe(630);
    // i biglietti portano il prezzo di fascia come costo base
    expect(s.store.tickets.get(paid.ticketIds[0]!)!.paidCents).toBe(3_150);
  });

  it("rifiuta l'ordine se la quantità supera l'allowance residua (limite 2/evento)", () => {
    const buyer = client(s.service, "marco", "idMarco");
    s.service.payOrder(s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1}).id); // 1 controllato
    expect(() => s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2})).toThrowError(/per evento/);
    // qty 1 rientra ancora
    const ok = s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1});
    expect(ok.quantity).toBe(1);
  });

  it("pay è idempotente: un secondo pagamento non concia di nuovo", () => {
    const buyer = client(s.service, "marco", "idMarco");
    const order = s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1});
    const first = s.service.payOrder(order.id);
    const second = s.service.payOrder(order.id);
    expect(second).toEqual(first);
    expect(s.service.ticketsOf(buyer.id)).toHaveLength(1);
    expect(s.store.accounts.get(buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET);
    expect(s.store.ledger.presaleCommissionCents).toBe(315);
  });
});

describe("Mercato secondario (v2)", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("list rifiutato oltre il tetto +5%", () => {
    const seller = client(s.service, "sara", "idSara");
    const t = s.service.payOrder(s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1}).id).ticketIds[0]!;
    const cap = resaleCapCents(3_150); // 3307
    expect(() => s.service.listTicket(t, seller.id, cap + 1)).toThrowError(/tetto/);
    const listed = s.service.listTicket(t, seller.id, cap);
    expect(listed.status).toBe("LISTED");
    expect(listed.askPriceCents).toBe(cap);
    expect(listed.market).toBe("Re-Selling");
  });

  it("list + buy: royalty split 0,5/0,5 al ledger, costo base trasferito, goodwill al venditore", () => {
    const seller = client(s.service, "sara", "idSara");
    const buyer = client(s.service, "luca", "idLuca");
    const t = s.service.payOrder(s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1}).id).ticketIds[0]!;
    s.service.listTicket(t, seller.id, 3_000);
    const goodwillBefore = s.store.accounts.get(seller.id)!.goodwill; // include il goodwill d'acquisto

    const res = s.service.buyFromMarket(t, buyer.id);
    // royalty 1% di 3150 = 31 → split 15/16
    expect(res.royalty).toEqual({tinftCents: 15, organizerCents: 16});
    expect(res.paidByBuyerCents).toBe(3_000 + 31);
    expect(res.ticket.ownerId).toBe(buyer.id);
    expect(res.ticket.paidCents).toBe(3_000); // costo base viaggia col token
    expect(res.ticket.status).toBe("ACTIVE");
    expect(res.ticket.askPriceCents).toBeUndefined();

    expect(s.store.ledger.royaltyTinftCents).toBe(15);
    expect(s.store.ledger.royaltyOrganizerCents).toBe(16);
    // goodwill venditore ~ euro: incremento round(3000/100) = 30
    expect(s.store.accounts.get(seller.id)!.goodwill - goodwillBefore).toBe(30);
    // transfer registrato PAYMENT/DONE con royalty
    const xfer = [...s.store.transfers.values()].find((x) => x.ticketId === t)!;
    expect(xfer.mode).toBe("PAYMENT");
    expect(xfer.status).toBe("DONE");
    expect(xfer.priceCents).toBe(3_000);
    expect(xfer.royaltyTinftCents).toBe(15);
  });

  it("buy rispetta il limite 2/evento del compratore", () => {
    const seller = client(s.service, "sara", "idSara");
    const buyer = client(s.service, "luca", "idLuca");
    // buyer porta già 2 biglietti dell'evento
    s.service.payOrder(s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2}).id);
    const t = s.service.payOrder(s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1}).id).ticketIds[0]!;
    s.service.listTicket(t, seller.id, 3_000);
    expect(() => s.service.buyFromMarket(t, buyer.id)).toThrowError(/per evento/);
  });
});

describe("Registrazione email + OTP (v2)", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("codice errato rifiutato; codice giusto crea un account verificato", () => {
    const {devCode} = s.service.startEmailRegistration({
      nome: "Marco",
      cognome: "Bianchi",
      cf: "BNCMRC90A01F205X",
      email: "mb@e.it",
      city: "Milano"
    });
    expect(devCode).toMatch(/^\d{6}$/);
    expect(() => s.service.verifyEmailRegistration("mb@e.it", "000000")).toThrowError(/codice/);

    const account = s.service.verifyEmailRegistration("mb@e.it", devCode);
    expect(account.role).toBe("CLIENTE");
    expect(account.verified).toBe(true);
    expect(account.cfHash).toMatch(/^0x/);
    expect(account.email).toBe("mb@e.it");
    // pending consumato: non riutilizzabile
    expect(() => s.service.verifyEmailRegistration("mb@e.it", devCode)).toThrowError(/codice/);
  });
});
