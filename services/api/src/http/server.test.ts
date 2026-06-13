import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";

describe("API HTTP (Fastify inject)", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    app = buildServer();
  });
  afterEach(async () => {
    await app.close();
  });

  async function post(url: string, payload: unknown) {
    return app.inject({method: "POST", url, payload: payload as object});
  }

  it("GET /health → ok", async () => {
    const res = await app.inject({method: "GET", url: "/health"});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({status: "ok"});
  });

  it("flusso: account → evento → acquisto → biglietti → validazione → export", async () => {
    const org = (await post("/accounts", {role: "ORGANIZER", nome: "Org", cognome: "X", email: "o@e.it"})).json();
    const evRes = await post("/events", {
      organizerId: org.id,
      title: "Vol.4",
      venue: "Magazzino",
      date: "21 GIU",
      priceCents: 3150,
      capacity: 10
    });
    expect(evRes.statusCode).toBe(201);
    const event = evRes.json();

    const buyer = (await post("/accounts", {nome: "Marco", cognome: "B", email: "m@e.it", cfHash: "idMarco"})).json();
    const buyRes = await post(`/events/${event.id}/purchase`, {buyerId: buyer.id});
    expect(buyRes.statusCode).toBe(201);
    const ticket = buyRes.json();
    expect(ticket.status).toBe("ACTIVE");

    const list = await app.inject({method: "GET", url: `/accounts/${buyer.id}/tickets`});
    expect(list.json()).toHaveLength(1);

    const val = await post(`/tickets/${ticket.id}/validate`, {});
    expect(val.json().outcome).toBe("VALID");

    const exp = await post(`/tickets/${ticket.id}/export`, {ownerId: buyer.id, mode: "FREE"});
    expect(exp.statusCode).toBe(200);
    expect(exp.json().exportMode).toBe("FREE");
    expect(exp.json().exitFeeCents).toBe(787); // 25% di 3150 (troncato)
  });

  it("errori mappati: evento inesistente → 404, oltre il limite → 409", async () => {
    const notFound = await post("/events/evt_999/purchase", {buyerId: "acc_999"});
    expect(notFound.statusCode).toBe(404);

    const org = (await post("/accounts", {role: "ORGANIZER", nome: "O", cognome: "X", email: "o2@e.it"})).json();
    const event = (
      await post("/events", {organizerId: org.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10})
    ).json();
    const buyer = (await post("/accounts", {nome: "L", cognome: "R", email: "l@e.it", cfHash: "idLuca"})).json();
    await post(`/events/${event.id}/purchase`, {buyerId: buyer.id});
    await post(`/events/${event.id}/purchase`, {buyerId: buyer.id});
    const third = await post(`/events/${event.id}/purchase`, {buyerId: buyer.id});
    expect(third.statusCode).toBe(409);
    expect(third.json().error).toBe("EVENT_LIMIT");
  });

  it("pagamento via HTTP: checkout → webhook idempotente → mint", async () => {
    const org = (await post("/accounts", {role: "ORGANIZER", nome: "O", cognome: "X", email: "o3@e.it"})).json();
    const event = (
      await post("/events", {organizerId: org.id, title: "E", venue: "V", date: "D", priceCents: 3150, capacity: 10})
    ).json();
    const buyer = (await post("/accounts", {nome: "M", cognome: "B", email: "m2@e.it", cfHash: "idM2"})).json();

    const checkout = await post("/payments/primary/checkout", {eventId: event.id, buyerId: buyer.id});
    expect(checkout.statusCode).toBe(201);
    const providerRef = checkout.json().session.providerRef;

    const wh = await post("/webhooks/psp", {id: "evt_http_1", type: "payment_succeeded", providerRef});
    expect(wh.statusCode).toBe(200);
    expect(wh.json().ticketId).toBeDefined();

    const again = await post("/webhooks/psp", {id: "evt_http_1", type: "payment_succeeded", providerRef});
    expect(again.json().deduped).toBe(true);

    const tickets = await app.inject({method: "GET", url: `/accounts/${buyer.id}/tickets`});
    expect(tickets.json()).toHaveLength(1); // idempotenza: un solo biglietto
  });

  it("SPID: verifica identità (hash CF) e abilita il limite 2/evento", async () => {
    const org = (await post("/accounts", {role: "ORGANIZER", nome: "O", cognome: "X", email: "o4@e.it"})).json();
    const event = (
      await post("/events", {organizerId: org.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10})
    ).json();
    const buyer = (await post("/accounts", {nome: "Sara", cognome: "C", email: "s@e.it"})).json(); // non verificata

    const verified = await post("/identity/spid/verify", {accountId: buyer.id, cf: "CNTSRA90A01F205X", salt: "s"});
    expect(verified.statusCode).toBe(200);
    expect(verified.json().verified).toBe(true);
    expect(verified.json().cfHash).toMatch(/^0x/);

    await post(`/events/${event.id}/purchase`, {buyerId: buyer.id});
    await post(`/events/${event.id}/purchase`, {buyerId: buyer.id});
    const third = await post(`/events/${event.id}/purchase`, {buyerId: buyer.id});
    expect(third.statusCode).toBe(409);
    expect(third.json().error).toBe("EVENT_LIMIT");
  });
});
