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

  async function post(url: string, payload: unknown, headers?: Record<string, string>) {
    return app.inject({method: "POST", url, payload: payload as object, headers});
  }
  async function get(url: string, headers?: Record<string, string>) {
    return app.inject({method: "GET", url, headers});
  }

  /** Crea un account con password, fa login e restituisce account + headers Bearer. */
  async function auth(input: {
    role?: "CLIENTE" | "ORGANIZER" | "VALIDATOR" | "PLATFORM";
    nome: string;
    cognome: string;
    email: string;
    cfHash?: string;
  }) {
    const account = (await post("/accounts", {...input, password: "1234"})).json();
    const token = (await post("/auth/login", {email: input.email, password: "1234"})).json().token as string;
    return {account, token, headers: {authorization: `Bearer ${token}`}};
  }

  it("GET /health → ok", async () => {
    const res = await app.inject({method: "GET", url: "/health"});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({status: "ok"});
  });

  it("flusso: account → evento → acquisto → biglietti → validazione → export", async () => {
    const org = await auth({role: "ORGANIZER", nome: "Org", cognome: "X", email: "o@e.it"});
    const evRes = await post(
      "/events",
      {organizerId: org.account.id, title: "Vol.4", venue: "Magazzino", date: "21 GIU", priceCents: 3150, capacity: 10},
      org.headers
    );
    expect(evRes.statusCode).toBe(201);
    const event = evRes.json();

    const buyer = await auth({nome: "Marco", cognome: "B", email: "m@e.it", cfHash: "idMarco"});
    const buyRes = await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id});
    expect(buyRes.statusCode).toBe(201);
    const ticket = buyRes.json();
    expect(ticket.status).toBe("ACTIVE");

    const list = await get(`/accounts/${buyer.account.id}/tickets`, buyer.headers);
    expect(list.json()).toHaveLength(1);

    const val = await post(`/tickets/${ticket.id}/validate`, {}, buyer.headers);
    expect(val.json().outcome).toBe("VALID");

    const exp = await post(`/tickets/${ticket.id}/export`, {ownerId: buyer.account.id, mode: "FREE"}, buyer.headers);
    expect(exp.statusCode).toBe(200);
    expect(exp.json().exportMode).toBe("FREE");
    expect(exp.json().exitFeeCents).toBe(787); // 25% di 3150 (troncato)
  });

  it("errori mappati: evento inesistente → 404, oltre il limite → 409", async () => {
    const notFound = await post("/events/evt_999/purchase", {buyerId: "acc_999"});
    expect(notFound.statusCode).toBe(404);

    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "o2@e.it"});
    const event = (
      await post("/events", {organizerId: org.account.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10}, org.headers)
    ).json();
    const buyer = await auth({nome: "L", cognome: "R", email: "l@e.it", cfHash: "idLuca"});
    await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id});
    await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id});
    const third = await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id});
    expect(third.statusCode).toBe(409);
    expect(third.json().error).toBe("EVENT_LIMIT");
  });

  it("pagamento via HTTP: checkout → webhook idempotente → mint", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "o3@e.it"});
    const event = (
      await post("/events", {organizerId: org.account.id, title: "E", venue: "V", date: "D", priceCents: 3150, capacity: 10}, org.headers)
    ).json();
    const buyer = await auth({nome: "M", cognome: "B", email: "m2@e.it", cfHash: "idM2"});

    const checkout = await post("/payments/primary/checkout", {eventId: event.id, buyerId: buyer.account.id});
    expect(checkout.statusCode).toBe(201);
    const providerRef = checkout.json().session.providerRef;

    const wh = await post("/webhooks/psp", {id: "evt_http_1", type: "payment_succeeded", providerRef});
    expect(wh.statusCode).toBe(200);
    expect(wh.json().ticketId).toBeDefined();

    const again = await post("/webhooks/psp", {id: "evt_http_1", type: "payment_succeeded", providerRef});
    expect(again.json().deduped).toBe(true);

    const tickets = await get(`/accounts/${buyer.account.id}/tickets`, buyer.headers);
    expect(tickets.json()).toHaveLength(1); // idempotenza: un solo biglietto
  });

  it("SPID: verifica identità (hash CF) e abilita il limite 2/evento", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "o4@e.it"});
    const event = (
      await post("/events", {organizerId: org.account.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10}, org.headers)
    ).json();
    const buyer = await auth({nome: "Sara", cognome: "C", email: "s@e.it"}); // non verificata

    const verified = await post("/identity/spid/verify", {accountId: buyer.account.id, cf: "CNTSRA90A01F205X", salt: "s"});
    expect(verified.statusCode).toBe(200);
    expect(verified.json().verified).toBe(true);
    expect(verified.json().cfHash).toMatch(/^0x/);

    await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id});
    await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id});
    const third = await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id});
    expect(third.statusCode).toBe(409);
    expect(third.json().error).toBe("EVENT_LIMIT");
  });

  it("registrazione completa (dati SPID) crea account verificato con tutti i dati", async () => {
    const r = await post("/register", {
      nome: "Marco",
      cognome: "Bianchi",
      email: "mb@e.it",
      cf: "BNCMRC90A01F205X",
      dateOfBirth: "1990-01-01",
      placeOfBirth: "Roma",
      gender: "M",
      address: "Via Roma 1",
      city: "Milano",
      zip: "20100",
      province: "MI",
      phone: "+39 333 000"
    });
    expect(r.statusCode).toBe(201);
    const a = r.json();
    expect(a.verified).toBe(true);
    expect(a.cfHash).toMatch(/^0x/);
    expect(a.cf).toBe("BNCMRC90A01F205X");
    expect(a.dateOfBirth).toBe("1990-01-01");
    expect(a.address).toBe("Via Roma 1");
    expect(a.province).toBe("MI");
  });

  it("GDPR: admin elimina un account col token; senza token 403; reiterato 404", async () => {
    const a = (await post("/accounts", {nome: "Da", cognome: "Cancellare", email: "del@e.it"})).json();
    const noTok = await app.inject({method: "DELETE", url: `/accounts/${a.id}`});
    expect(noTok.statusCode).toBe(403);
    const ok = await app.inject({method: "DELETE", url: `/accounts/${a.id}`, headers: {"x-admin-token": "dev-admin"}});
    expect(ok.statusCode).toBe(200);
    const again = await app.inject({method: "DELETE", url: `/accounts/${a.id}`, headers: {"x-admin-token": "dev-admin"}});
    expect(again.statusCode).toBe(404);
  });

  // -------- guardie di autenticazione / ownership
  it("rotta protetta senza token → 401", async () => {
    const buyer = await auth({nome: "B", cognome: "Y", email: "guard1@e.it"});
    const noTok = await get(`/accounts/${buyer.account.id}/tickets`);
    expect(noTok.statusCode).toBe(401);
    expect(noTok.json().error).toBe("BAD_TOKEN");
  });

  it("agire sull'id di un altro account → 403", async () => {
    const a = await auth({nome: "A", cognome: "A", email: "guard2a@e.it"});
    const b = await auth({nome: "B", cognome: "B", email: "guard2b@e.it"});
    // a usa il proprio token ma chiede i biglietti di b
    const denied = await get(`/accounts/${b.account.id}/tickets`, a.headers);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("FORBIDDEN");
  });
});
