import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {PaymentsService} from "../payments/service";
import {FakeProvider} from "../payments/provider";
import {GOODWILL_PER_TICKET} from "../domain/rules";
import type {ChainPort, MintParams, MintResult} from "../chain/port";

const PRICE = 3_150; // €31,50 → prevendita 10% = 315/biglietto

/** ChainPort che fallisce UNA volta all'N-esimo mint (simula RPC giù), poi conia. */
class FlakyChain implements ChainPort {
  calls = 0;
  constructor(private readonly failOnCall: number) {}
  async mintTicket(_p: MintParams): Promise<MintResult> {
    this.calls++;
    if (this.calls === this.failOnCall) throw new Error("RPC on-chain non raggiungibile (simulato)");
    return {tokenId: this.calls, txHash: "0x" + this.calls.toString(16).padStart(64, "0")};
  }
}

async function world(chain: ChainPort) {
  const store = new MemoryStore();
  const service = new TicketingService(store, undefined, undefined, chain);
  const org = await service.createAccount({role: "ORGANIZER", nome: "Org", cognome: "Anizer", email: "org@e.it"});
  const event = await service.createEvent({organizerId: org.id, title: "Vol.4", venue: "Magazzino", date: "21 GIU", priceCents: PRICE, capacity: 100});
  const buyer = await service.createAccount({nome: "Marco", cognome: "B", email: "m@e.it", cfHash: "idMarco"});
  return {store, service, event, buyer};
}

describe("payOrder — affidabilità (mai perso, mai doppio)", () => {
  it("riprende dopo un mint fallito a metà ordine: niente doppio mint né doppio accredito", async () => {
    const flaky = new FlakyChain(2); // 1° mint ok, 2° mint lancia, 3°+ ok
    const w = await world(flaky);
    const order = await w.service.createOrder({buyerId: w.buyer.id, eventId: w.event.id, quantity: 2});

    // 1° tentativo: il 2° mint fallisce → l'ordine NON viene evaso, ma il 1° biglietto resta.
    await expect(w.service.payOrder(order.id)).rejects.toThrow(/RPC/);
    const partial = await w.service.getOrder(order.id);
    expect(partial.status).toBe("PENDING"); // pagamento non perso, da riprendere
    expect(partial.ticketIds).toHaveLength(1); // un solo biglietto già coniato
    expect((await w.service.getEvent(w.event.id)).sold).toBe(1); // sold NON raddoppiato
    expect(w.store.ledger.presaleCommissionCents).toBe(0); // nessun accredito finché non evaso
    expect(w.store.accounts.get(w.buyer.id)!.goodwill).toBe(0);

    // 2° tentativo (redelivery / retry): RIPRENDE dal biglietto mancante.
    const paid = await w.service.payOrder(order.id);
    expect(paid.status).toBe("PAID");
    expect(paid.ticketIds).toHaveLength(2);
    expect(new Set(paid.ticketIds).size).toBe(2); // due id distinti
    expect(await w.service.ticketsOf(w.buyer.id)).toHaveLength(2); // esattamente 2, non 3/4
    expect((await w.service.getEvent(w.event.id)).sold).toBe(2);
    expect(flaky.calls).toBe(3); // 1 ok + 1 fallito + 1 ok ⇒ ripresa, non restart
    // accrediti esattamente UNA volta
    expect(w.store.ledger.presaleCommissionCents).toBe(630); // 315 × 2
    expect(w.store.accounts.get(w.buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET * 2);
  });

  it("idempotente: un secondo payOrder su ordine PAID non concia né accredita di nuovo", async () => {
    const w = await world(new FlakyChain(99)); // non fallisce mai
    const order = await w.service.createOrder({buyerId: w.buyer.id, eventId: w.event.id, quantity: 2});
    const first = await w.service.payOrder(order.id);
    const second = await w.service.payOrder(order.id);
    expect(second).toEqual(first);
    expect(await w.service.ticketsOf(w.buyer.id)).toHaveLength(2);
    expect(w.store.ledger.presaleCommissionCents).toBe(630);
    expect(w.store.accounts.get(w.buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET * 2);
  });

  it("consegne CONCORRENTI dello stesso ordine: serializzate → niente doppio mint né doppio accredito", async () => {
    const w = await world(new FlakyChain(99));
    const order = await w.service.createOrder({buyerId: w.buyer.id, eventId: w.event.id, quantity: 2});
    // due webhook PSP in parallelo sullo stesso ordine (race)
    const [a, b] = await Promise.all([w.service.payOrder(order.id), w.service.payOrder(order.id)]);
    expect(a.status).toBe("PAID");
    expect(b.status).toBe("PAID");
    expect(await w.service.ticketsOf(w.buyer.id)).toHaveLength(2); // 2, NON 4
    expect((await w.service.getEvent(w.event.id)).sold).toBe(2);
    expect(w.store.ledger.presaleCommissionCents).toBe(630); // accredito una sola volta
    expect(w.store.accounts.get(w.buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET * 2);
  });

  it("settleOrder è idempotente a livello store: due chiamate accreditano una sola volta", async () => {
    const w = await world(new FlakyChain(99));
    const order = await w.service.createOrder({buyerId: w.buyer.id, eventId: w.event.id, quantity: 1});
    const args = {orderId: order.id, ticketIds: [], presaleCommissionCents: 315, buyerId: w.buyer.id, goodwillDelta: GOODWILL_PER_TICKET};
    await w.store.settleOrder(args);
    await w.store.settleOrder(args); // 2ª volta: no-op
    expect((await w.store.getOrder(order.id))!.status).toBe("PAID");
    expect(w.store.ledger.presaleCommissionCents).toBe(315);
    expect(w.store.accounts.get(w.buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET);
  });
});

describe("webhook PSP — un ordine pagato non resta mai bloccato", () => {
  it("se il handling fallisce l'evento NON è marcato processato: la redelivery lo ritenta e completa", async () => {
    const flaky = new FlakyChain(2); // fallisce sul 2° mint dell'ordine qty=2
    const store = new MemoryStore();
    const ticketing = new TicketingService(store, undefined, undefined, flaky);
    const payments = new PaymentsService(store, ticketing, new FakeProvider(), flaky);
    const org = await ticketing.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: "o@e.it"});
    const event = await ticketing.createEvent({organizerId: org.id, title: "E", venue: "V", date: "D", priceCents: PRICE, capacity: 10});
    const buyer = await ticketing.createAccount({nome: "Marco", cognome: "B", email: "m@e.it", cfHash: "idMarco"});

    const order = await ticketing.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 2});
    const {payment, providerRef} = await payments.createOrderCheckout(order.id);
    const event_id = "evt_ord_flaky";

    // 1ª consegna del webhook: il mint fallisce → handleWebhook lancia, evento NON processato.
    await expect(payments.handleWebhook({id: event_id, type: "payment_succeeded", providerRef})).rejects.toThrow(/RPC/);
    expect(await store.hasProcessedWebhook(event_id)).toBe(false); // ⇒ ritentabile, non scartato
    expect(store.payments.get(payment.id)!.status).toBe("PENDING");
    expect((await ticketing.getOrder(order.id)).status).toBe("PENDING");
    expect(await ticketing.ticketsOf(buyer.id)).toHaveLength(1);
    expect(store.ledger.presaleCommissionCents).toBe(0);

    // 2ª consegna (stesso id evento): riprende e completa.
    const res = await payments.handleWebhook({id: event_id, type: "payment_succeeded", providerRef});
    expect(res.handled).toBe(true);
    expect(await store.hasProcessedWebhook(event_id)).toBe(true); // ora marcato
    expect(store.payments.get(payment.id)!.status).toBe("PAID");
    const paid = await ticketing.getOrder(order.id);
    expect(paid.status).toBe("PAID");
    expect(paid.ticketIds).toHaveLength(2);
    expect(await ticketing.ticketsOf(buyer.id)).toHaveLength(2); // accredito singolo
    expect(store.ledger.presaleCommissionCents).toBe(630);
    expect(store.accounts.get(buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET * 2);
  });
});
