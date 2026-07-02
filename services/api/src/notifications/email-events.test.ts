import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "../services/ticketing";
import {type EmailMessage, type EmailSender, orderConfirmationEmail} from "./email";

/**
 * FASE 8 — email di prodotto: conferma d'ordine al pagamento (best-effort, mai
 * bloccante, mai doppia) e promemoria evento ai possessori (dedup per indirizzo,
 * esclusi USED/EXPORTED/revocati, solo l'organizzatore).
 */
class SpySender implements EmailSender {
  readonly exposesDevCode = false;
  sent: EmailMessage[] = [];
  failNext = false;
  async sendOtp(): Promise<void> {}
  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("provider giù");
    }
    this.sent.push(message);
  }
}

function setup() {
  const store = new MemoryStore();
  const email = new SpySender();
  const service = new TicketingService(store, undefined, undefined, undefined, email);
  return {store, email, service};
}

async function world(service: TicketingService) {
  const org = await service.createAccount({role: "ORGANIZER", nome: "Org", cognome: "X", email: "org@e.it"});
  const event = await service.createEvent({
    organizerId: org.id, title: "Notte <Elettronica>", venue: "Magazzino", date: "21 GIU", priceCents: 3000, capacity: 50
  });
  const buyer = await service.createAccount({nome: "Marco", cognome: "B", email: "marco@e.it"});
  return {org, event, buyer};
}

describe("email di conferma d'ordine (al pagamento)", () => {
  it("payOrder → UNA conferma al compratore con titolo e totale; il ritento non la duplica", async () => {
    const {email, service} = setup();
    const {event, buyer} = await world(service);

    const order = await service.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 2});
    await service.payOrder(order.id);

    expect(email.sent).toHaveLength(1);
    const msg = email.sent[0]!;
    expect(msg.to).toBe("marco@e.it");
    expect(msg.subject).toContain("Notte <Elettronica>");
    expect(msg.text).toContain("€ 66,00"); // (3000+300)×2
    expect(msg.html).toContain("Notte &lt;Elettronica&gt;"); // HTML escapato

    // seconda consegna del webhook: ordine già PAID → nessuna seconda email
    await service.payOrder(order.id);
    expect(email.sent).toHaveLength(1);
  });

  it("provider email giù: il pagamento NON fallisce (best-effort)", async () => {
    const {email, service} = setup();
    const {event, buyer} = await world(service);
    const order = await service.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 1});

    email.failNext = true;
    const paid = await service.payOrder(order.id);
    expect(paid.status).toBe("PAID");
    expect(email.sent).toHaveLength(0);
  });
});

describe("promemoria evento (organizzatore → possessori)", () => {
  it("una email per indirizzo (dedup), esclusi biglietti usati/revocati; conteggio esatto", async () => {
    const {store, email, service} = setup();
    const {org, event, buyer} = await world(service);
    const buyer2 = await service.createAccount({nome: "Giulia", cognome: "V", email: "giulia@e.it"});

    // Marco ha 2 biglietti (→ 1 sola email), Giulia 1 usato + 1 valido (→ 1 email)
    await service.payOrder((await service.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 2})).id);
    const g = await service.payOrder((await service.createOrder({buyerId: buyer2.id, eventId: event.id, quantity: 2})).id);
    const used = await service.getTicketById(g.ticketIds[0]!);
    used.status = "USED";
    await store.updateTicket(used);

    email.sent = []; // ignora le conferme d'ordine
    const res = await service.remindEvent(event.id, org.id);
    expect(res).toEqual({recipients: 2, sent: 2});
    expect(email.sent.map((m) => m.to).sort()).toEqual(["giulia@e.it", "marco@e.it"]);
    expect(email.sent[0]!.subject).toContain("Promemoria");
    expect(email.sent[0]!.text).toContain("21 GIU");
  });

  it("solo l'organizzatore proprietario; un destinatario che fallisce non blocca gli altri", async () => {
    const {email, service} = setup();
    const {org, event, buyer} = await world(service);
    const other = await service.createAccount({role: "ORGANIZER", nome: "P", cognome: "Y", email: "other@e.it"});
    await expect(service.remindEvent(event.id, other.id)).rejects.toThrowError(/organizzatore/);

    const buyer2 = await service.createAccount({nome: "G", cognome: "V", email: "g2@e.it"});
    await service.payOrder((await service.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 1})).id);
    await service.payOrder((await service.createOrder({buyerId: buyer2.id, eventId: event.id, quantity: 1})).id);

    email.sent = [];
    email.failNext = true; // il primo invio fallisce
    const res = await service.remindEvent(event.id, org.id);
    expect(res.recipients).toBe(2);
    expect(res.sent).toBe(1); // l'altro è comunque partito
    expect(email.sent).toHaveLength(1);
  });
});

describe("template", () => {
  it("orderConfirmationEmail: singolare/plurale e formato euro", () => {
    const uno = orderConfirmationEmail({
      to: "a@e.it", buyerName: "A", eventTitle: "T", venue: "V", date: "D", quantity: 1, totalCents: 3465
    });
    expect(uno.text).toContain("1 biglietto");
    expect(uno.text).toContain("€ 34,65");
    const due = orderConfirmationEmail({
      to: "a@e.it", buyerName: "A", eventTitle: "T", venue: "V", date: "D", quantity: 2, totalCents: 100
    });
    expect(due.html).toContain("i tuoi 2 biglietti");
  });
});
