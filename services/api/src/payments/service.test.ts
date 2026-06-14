import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "../services/ticketing";
import {PaymentsService} from "./service";
import {FakeProvider} from "./provider";
import {FakeChain} from "../chain/fake";

async function setup() {
  const store = new MemoryStore();
  const ticketing = new TicketingService(store);
  const payments = new PaymentsService(store, ticketing, new FakeProvider(), new FakeChain());
  const org = await ticketing.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: "o@e.it"});
  const event = await ticketing.createEvent({organizerId: org.id, title: "E", venue: "V", date: "D", priceCents: 3150, capacity: 10});
  const buyer = await ticketing.createAccount({nome: "Marco", cognome: "B", email: "m@e.it", cfHash: "idMarco"});
  return {store, ticketing, payments, event, buyer};
}

describe("PaymentsService", () => {
  it("checkout → webhook pagato concia il biglietto (con txHash on-chain)", async () => {
    const s = await setup();
    const {payment, session} = await s.payments.createPrimaryCheckout(s.event.id, s.buyer.id);
    expect(payment.status).toBe("PENDING");
    const res = await s.payments.handleWebhook({id: "evt_1", type: "payment_succeeded", providerRef: session.providerRef});
    expect(res.handled).toBe(true);
    expect(res.ticketId).toBeDefined();
    const tickets = await s.ticketing.ticketsOf(s.buyer.id);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.txHash).toBeDefined();
    expect(s.store.payments.get(payment.id)!.status).toBe("PAID");
  });

  it("webhook idempotente: lo stesso evento non concia due volte", async () => {
    const s = await setup();
    const {session} = await s.payments.createPrimaryCheckout(s.event.id, s.buyer.id);
    const ev = {id: "evt_1", type: "payment_succeeded" as const, providerRef: session.providerRef};
    await s.payments.handleWebhook(ev);
    const again = await s.payments.handleWebhook(ev);
    expect(again.deduped).toBe(true);
    expect(await s.ticketing.ticketsOf(s.buyer.id)).toHaveLength(1); // un solo biglietto
  });

  it("payment_failed segna fallito e non concia", async () => {
    const s = await setup();
    const {payment, session} = await s.payments.createPrimaryCheckout(s.event.id, s.buyer.id);
    await s.payments.handleWebhook({id: "evt_x", type: "payment_failed", providerRef: session.providerRef});
    expect(s.store.payments.get(payment.id)!.status).toBe("FAILED");
    expect(await s.ticketing.ticketsOf(s.buyer.id)).toHaveLength(0);
  });

  it("providerRef sconosciuto → non gestito", async () => {
    const s = await setup();
    const res = await s.payments.handleWebhook({id: "evt_z", type: "payment_succeeded", providerRef: "cs_inesistente"});
    expect(res.handled).toBe(false);
  });

  it("ingestWebhook valida il payload (firma/formato)", async () => {
    const s = await setup();
    await expect(s.payments.ingestWebhook("non-json")).rejects.toThrow();
  });

  it("ordine: createOrderCheckout → webhook 'succeeded' paga l'ordine (idempotente)", async () => {
    const s = await setup();
    const order = await s.ticketing.createOrder({buyerId: s.buyer.id, eventId: s.event.id, quantity: 2});
    expect(order.status).toBe("PENDING");
    expect(order.totalCents).toBe(6_930); // (3150 + prevendita 10% 315) × 2

    const {payment, checkoutUrl, providerRef} = await s.payments.createOrderCheckout(order.id);
    expect(payment.status).toBe("PENDING");
    expect(payment.orderId).toBe(order.id);
    expect(payment.amountCents).toBe(6_930);
    expect(checkoutUrl).toContain(providerRef);
    expect(s.store.payments.get(payment.id)!.status).toBe("PENDING");

    // evento PSP "succeeded" corrispondente alla sessione dell'ordine
    const body = JSON.stringify({id: "evt_ord_1", type: "payment_succeeded", providerRef, orderId: order.id});
    const res = await s.payments.ingestWebhook(body);
    expect(res.handled).toBe(true);
    expect(res.ticketId).toBeDefined();

    // payOrder è andato a buon fine: ordine PAID, 2 biglietti, ledger + goodwill
    const paid = await s.ticketing.getOrder(order.id);
    expect(paid.status).toBe("PAID");
    expect(paid.ticketIds).toHaveLength(2);
    expect(await s.ticketing.ticketsOf(s.buyer.id)).toHaveLength(2);
    expect((await s.store.getLedger()).presaleCommissionCents).toBe(630); // 315 × 2
    expect(s.store.accounts.get(s.buyer.id)!.goodwill).toBe(30); // 15 × 2
    expect(s.store.payments.get(payment.id)!.status).toBe("PAID");

    // stesso webhook di nuovo → dedup, nessun doppio mint
    const again = await s.payments.ingestWebhook(body);
    expect(again.deduped).toBe(true);
    expect(await s.ticketing.ticketsOf(s.buyer.id)).toHaveLength(2);
    expect((await s.store.getLedger()).presaleCommissionCents).toBe(630);
    expect(s.store.accounts.get(s.buyer.id)!.goodwill).toBe(30);
  });

  it("ordine: checkout consentito solo su ordine PENDING", async () => {
    const s = await setup();
    const order = await s.ticketing.createOrder({buyerId: s.buyer.id, eventId: s.event.id, quantity: 1});
    await s.ticketing.payOrder(order.id); // ora è PAID
    await expect(s.payments.createOrderCheckout(order.id)).rejects.toThrowError(/PENDING|attesa/i);
  });
});
