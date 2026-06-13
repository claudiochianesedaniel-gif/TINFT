import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "../services/ticketing";
import {PaymentsService} from "./service";
import {FakeProvider} from "./provider";

function setup() {
  const store = new MemoryStore();
  const ticketing = new TicketingService(store);
  const payments = new PaymentsService(store, ticketing, new FakeProvider());
  const org = ticketing.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: "o@e.it"});
  const event = ticketing.createEvent({organizerId: org.id, title: "E", venue: "V", date: "D", priceCents: 3150, capacity: 10});
  const buyer = ticketing.createAccount({nome: "Marco", cognome: "B", email: "m@e.it", cfHash: "idMarco"});
  return {store, ticketing, payments, event, buyer};
}

describe("PaymentsService", () => {
  it("checkout → webhook pagato concia il biglietto", () => {
    const s = setup();
    const {payment, session} = s.payments.createPrimaryCheckout(s.event.id, s.buyer.id);
    expect(payment.status).toBe("PENDING");
    const res = s.payments.handleWebhook({id: "evt_1", type: "payment_succeeded", providerRef: session.providerRef});
    expect(res.handled).toBe(true);
    expect(res.ticketId).toBeDefined();
    expect(s.ticketing.ticketsOf(s.buyer.id)).toHaveLength(1);
    expect(s.store.payments.get(payment.id)!.status).toBe("PAID");
  });

  it("webhook idempotente: lo stesso evento non concia due volte", () => {
    const s = setup();
    const {session} = s.payments.createPrimaryCheckout(s.event.id, s.buyer.id);
    const ev = {id: "evt_1", type: "payment_succeeded" as const, providerRef: session.providerRef};
    s.payments.handleWebhook(ev);
    const again = s.payments.handleWebhook(ev);
    expect(again.deduped).toBe(true);
    expect(s.ticketing.ticketsOf(s.buyer.id)).toHaveLength(1); // un solo biglietto
  });

  it("payment_failed segna fallito e non concia", () => {
    const s = setup();
    const {payment, session} = s.payments.createPrimaryCheckout(s.event.id, s.buyer.id);
    s.payments.handleWebhook({id: "evt_x", type: "payment_failed", providerRef: session.providerRef});
    expect(s.store.payments.get(payment.id)!.status).toBe("FAILED");
    expect(s.ticketing.ticketsOf(s.buyer.id)).toHaveLength(0);
  });

  it("providerRef sconosciuto → non gestito", () => {
    const s = setup();
    const res = s.payments.handleWebhook({id: "evt_z", type: "payment_succeeded", providerRef: "cs_inesistente"});
    expect(res.handled).toBe(false);
  });

  it("ingestWebhook valida il payload (firma/formato)", () => {
    const s = setup();
    expect(() => s.payments.ingestWebhook("non-json")).toThrowError();
  });
});
