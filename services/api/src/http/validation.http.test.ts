import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";

/**
 * Validazione input (JSON schema Fastify): corpi malformati / campi mancanti /
 * tipi errati → 400 {error:"VALIDATION"}, mai 500 o crash. Più una regressione
 * "happy path" per ogni route, così le schema non risultano troppo strette.
 */
describe("API HTTP — validazione input (JSON schema → 400)", () => {
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

  // -------------------------------------------------------------------- login
  it("POST /auth/login: senza password → 400 VALIDATION", async () => {
    const r = await post("/auth/login", {email: "x@e.it"});
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("VALIDATION");
  });

  it("POST /auth/login: corpo valido ma credenziali errate → 401 (non 400)", async () => {
    const r = await post("/auth/login", {email: "x@e.it", password: "nope"});
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe("BAD_CREDENTIALS");
  });

  // ------------------------------------------------------------------- accounts
  it("POST /accounts: senza email → 400 VALIDATION; valido → 201 (regressione)", async () => {
    const bad = await post("/accounts", {nome: "A", cognome: "B"});
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("VALIDATION");

    const ok = await post("/accounts", {nome: "A", cognome: "B", email: "ok-acc@e.it"});
    expect(ok.statusCode).toBe(201);
    expect(ok.json().email).toBe("ok-acc@e.it");
  });

  it("POST /accounts: ruolo fuori enum → 400 VALIDATION", async () => {
    const r = await post("/accounts", {nome: "A", cognome: "B", email: "role@e.it", role: "SUPERUSER"});
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("VALIDATION");
  });

  // --------------------------------------------------------------------- orders
  it("POST /orders: quantity tipo errato → 400 VALIDATION", async () => {
    const o = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "v-ord-o@e.it"});
    const ev = (
      await post("/events", {organizerId: o.account.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10}, o.headers)
    ).json();
    const b = await auth({nome: "B", cognome: "Y", email: "v-ord-b@e.it", cfHash: "idVOrd"});

    const bad = await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: "x"}, b.headers);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("VALIDATION");

    // happy path → 201 PENDING (regressione)
    const ok = await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 1}, b.headers);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().status).toBe("PENDING");
  });

  it("POST /orders: eventId mancante → 400 VALIDATION", async () => {
    const b = await auth({nome: "B", cognome: "Y", email: "v-ord-miss@e.it", cfHash: "idVOrdMiss"});
    const r = await post("/orders", {buyerId: b.account.id, quantity: 1}, b.headers);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("VALIDATION");
  });

  it("POST /orders: quantity < 1 → 400 VALIDATION", async () => {
    const o = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "v-ord-zero-o@e.it"});
    const ev = (
      await post("/events", {organizerId: o.account.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10}, o.headers)
    ).json();
    const b = await auth({nome: "B", cognome: "Y", email: "v-ord-zero-b@e.it", cfHash: "idVOrdZero"});
    const r = await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 0}, b.headers);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("VALIDATION");
  });

  // --------------------------------------------------------------------- events
  it("POST /events: priceCents negativo → 400 VALIDATION", async () => {
    const o = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "v-ev-neg@e.it"});
    const r = await post(
      "/events",
      {organizerId: o.account.id, title: "E", venue: "V", date: "D", priceCents: -5, capacity: 10},
      o.headers
    );
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("VALIDATION");
  });

  it("POST /events: title mancante → 400 VALIDATION; valido → 201 (regressione)", async () => {
    const o = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "v-ev-title@e.it"});
    const bad = await post("/events", {organizerId: o.account.id, venue: "V", date: "D", priceCents: 1000, capacity: 10}, o.headers);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("VALIDATION");

    const ok = await post(
      "/events",
      {organizerId: o.account.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10},
      o.headers
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.json().title).toBe("E");
  });

  // ---------------------------------------------------------------- validate/scan
  it("POST /validate/scan: token mancante → 400 VALIDATION", async () => {
    const staff = await auth({role: "VALIDATOR", nome: "Gate", cognome: "K", email: "v-scan-staff@e.it"});
    const r = await post("/validate/scan", {}, staff.headers);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("VALIDATION");
  });

  it("POST /validate/scan: token spazzatura (valido come stringa) → 200 FAKE (regressione)", async () => {
    const staff = await auth({role: "VALIDATOR", nome: "Gate", cognome: "K", email: "v-scan-ok@e.it"});
    const r = await post("/validate/scan", {token: "garbage"}, staff.headers);
    expect(r.statusCode).toBe(200);
    expect(r.json().outcome).toBe("FAKE");
  });

  // -------------------------------------------------------------- enum: transfers
  it("POST /tickets/:id/transfers: mode fuori enum → 400 VALIDATION", async () => {
    const a = await auth({nome: "A", cognome: "A", email: "v-tr@e.it"});
    const r = await post(`/tickets/tkt_1/transfers`, {fromId: a.account.id, mode: "BARTER"}, a.headers);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("VALIDATION");
  });

  // -------------------------------------------------------------------- readiness
  it("GET /ready → 200 {ready:true}", async () => {
    const r = await app.inject({method: "GET", url: "/ready"});
    expect(r.statusCode).toBe(200);
    expect(r.json().ready).toBe(true);
  });
});
