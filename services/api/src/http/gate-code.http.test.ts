import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";

/**
 * Codice varco (gateCode) come campo di prima classe dell'evento (FASE 1):
 * creazione con/senza codice, unicità, esposizione su GET, rotazione/revoca
 * (solo organizzatore) e aggancio staff via POST /gate/access (mai un picker).
 */
describe("API HTTP — codice varco (gateCode)", () => {
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
  }) {
    const account = (await post("/accounts", {...input, password: "1234"})).json();
    const token = (await post("/auth/login", {email: input.email, password: "1234"})).json().token as string;
    return {account, token, headers: {authorization: `Bearer ${token}`}};
  }

  async function createEvent(org: Awaited<ReturnType<typeof auth>>, extra: Record<string, unknown> = {}) {
    return post(
      "/events",
      {organizerId: org.account.id, title: "Notte Elettronica", venue: "Magazzino", date: "21 GIU", priceCents: 1000, capacity: 100, ...extra},
      org.headers
    );
  }

  // ------------------------------------------------------------------ creazione
  it("POST /events senza gateCode → generato dal titolo (PREFIX-XXXX) e restituito", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-auto@e.it"});
    const r = await createEvent(org);
    expect(r.statusCode).toBe(201);
    const ev = r.json();
    expect(ev.gateCode).toMatch(/^NOTTE-[A-Z2-9]{4}$/);
  });

  it("POST /events con gateCode esplicito → normalizzato (maiuscole, senza spazi) e persistito", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-expl@e.it"});
    const r = await createEvent(org, {gateCode: "  notte-7k2 "});
    expect(r.statusCode).toBe(201);
    expect(r.json().gateCode).toBe("NOTTE-7K2");

    // GET lo restituisce
    const got = await app.inject({method: "GET", url: `/events/${r.json().id}`});
    expect(got.json().gateCode).toBe("NOTTE-7K2");
  });

  it("POST /events con gateCode già in uso → 409 GATE_CODE_TAKEN (anche se scritto diverso)", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-dup@e.it"});
    expect((await createEvent(org, {gateCode: "DUPLO-1A2"})).statusCode).toBe(201);
    const dup = await createEvent(org, {gateCode: "duplo-1a2"});
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe("GATE_CODE_TAKEN");
  });

  it("POST /events con gateCode vuoto → 400 INVALID_GATE_CODE", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-empty@e.it"});
    const r = await createEvent(org, {gateCode: "   "});
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("INVALID_GATE_CODE");
  });

  // ------------------------------------------------------------- aggancio staff
  it("POST /gate/access con codice valido → evento agganciato (normalizzazione inclusa)", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-gate-o@e.it"});
    const ev = (await createEvent(org, {gateCode: "GATE-4T7"})).json();
    const staff = await auth({role: "VALIDATOR", nome: "S", cognome: "V", email: "gc-gate-s@e.it"});

    const r = await post("/gate/access", {code: " gate-4t7 "}, staff.headers);
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toBe(ev.id);
    expect(r.json().title).toBe("Notte Elettronica");
  });

  it("POST /gate/access con codice sconosciuto → 404; senza token → 401", async () => {
    const staff = await auth({role: "VALIDATOR", nome: "S", cognome: "V", email: "gc-gate-x@e.it"});
    const r = await post("/gate/access", {code: "NOPE-0000"}, staff.headers);
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toBe("NOT_FOUND");

    const anon = await post("/gate/access", {code: "NOPE-0000"});
    expect(anon.statusCode).toBe(401);
  });

  // ------------------------------------------------------------ rotate / revoke
  it("rotate: nuovo codice unico, il vecchio smette di agganciare", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-rot-o@e.it"});
    const ev = (await createEvent(org, {gateCode: "ROTTE-1B2"})).json();
    const staff = await auth({role: "VALIDATOR", nome: "S", cognome: "V", email: "gc-rot-s@e.it"});

    const rot = await post(`/events/${ev.id}/gate-code/rotate`, {organizerId: org.account.id}, org.headers);
    expect(rot.statusCode).toBe(200);
    const next = rot.json().gateCode as string;
    expect(next).toMatch(/^NOTTE-[A-Z2-9]{4}$/);
    expect(next).not.toBe("ROTTE-1B2");

    // il vecchio codice non aggancia più; il nuovo sì
    expect((await post("/gate/access", {code: "ROTTE-1B2"}, staff.headers)).statusCode).toBe(404);
    expect((await post("/gate/access", {code: next}, staff.headers)).json().id).toBe(ev.id);
  });

  it("revoke: gateCode assente, nessun aggancio finché non si ruota", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-rev-o@e.it"});
    const ev = (await createEvent(org, {gateCode: "REVOC-9Z8"})).json();
    const staff = await auth({role: "VALIDATOR", nome: "S", cognome: "V", email: "gc-rev-s@e.it"});

    const rev = await post(`/events/${ev.id}/gate-code/revoke`, {organizerId: org.account.id}, org.headers);
    expect(rev.statusCode).toBe(200);
    expect(rev.json().gateCode).toBeUndefined();
    expect((await post("/gate/access", {code: "REVOC-9Z8"}, staff.headers)).statusCode).toBe(404);

    // la rotazione riattiva l'aggancio con un nuovo codice
    const rot = await post(`/events/${ev.id}/gate-code/rotate`, {organizerId: org.account.id}, org.headers);
    expect((await post("/gate/access", {code: rot.json().gateCode}, staff.headers)).json().id).toBe(ev.id);
  });

  it("rotate/revoke di un altro organizzatore → 403 (guardia self + proprietà)", async () => {
    const org = await auth({role: "ORGANIZER", nome: "O", cognome: "X", email: "gc-own-o@e.it"});
    const other = await auth({role: "ORGANIZER", nome: "P", cognome: "Y", email: "gc-own-p@e.it"});
    const ev = (await createEvent(org, {gateCode: "OWNED-3C4"})).json();

    // other su se stesso ma evento altrui → NOT_OWNER; other per conto di org → FORBIDDEN
    const notOwner = await post(`/events/${ev.id}/gate-code/rotate`, {organizerId: other.account.id}, other.headers);
    expect(notOwner.statusCode).toBe(403);
    const forbidden = await post(`/events/${ev.id}/gate-code/revoke`, {organizerId: org.account.id}, other.headers);
    expect(forbidden.statusCode).toBe(403);
  });
});
