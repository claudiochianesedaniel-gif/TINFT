import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";
import {signAccessToken} from "../access/access-token";

describe("API HTTP — access-token + /validate/scan (app nativa)", () => {
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

  /** Organizzatore + evento + biglietto ACTIVE intestato a `buyer`. */
  async function ticketFor(buyer: Awaited<ReturnType<typeof auth>>) {
    const org = await auth({role: "ORGANIZER", nome: "Org", cognome: "X", email: `org_${Math.random()}@e.it`});
    const event = (
      await post(
        "/events",
        {organizerId: org.account.id, title: "Vol.4", venue: "Magazzino", date: "21 GIU", priceCents: 3150, capacity: 10},
        org.headers
      )
    ).json();
    const ticket = (await post(`/events/${event.id}/purchase`, {buyerId: buyer.account.id})).json();
    return {org, event, ticket};
  }

  it("GET /tickets/:id/access-token: 401 senza token, owner-gated, restituisce token+exp+rotateSeconds", async () => {
    const buyer = await auth({nome: "Marco", cognome: "B", email: "scan_buyer@e.it", cfHash: "idMarco"});
    const {ticket} = await ticketFor(buyer);

    // senza token → 401
    const noTok = await get(`/tickets/${ticket.id}/access-token`);
    expect(noTok.statusCode).toBe(401);

    // altro account → 403 (owner-gated)
    const other = await auth({nome: "Sara", cognome: "C", email: "scan_other@e.it"});
    const forbidden = await get(`/tickets/${ticket.id}/access-token`, other.headers);
    expect(forbidden.statusCode).toBe(403);

    // il proprietario ottiene il token a rotazione
    const ok = await get(`/tickets/${ticket.id}/access-token`, buyer.headers);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token.split(".")).toHaveLength(3);
    expect(ok.json().rotateSeconds).toBe(30);
    expect(typeof ok.json().exp).toBe("number");

    // biglietto inesistente → 404
    const missing = await get(`/tickets/tkt_999/access-token`, buyer.headers);
    expect(missing.statusCode).toBe(404);
  });

  it("POST /validate/scan: token fresco → VALID (biglietto BRUCIATO); ri-scan → DUPLICATE", async () => {
    const buyer = await auth({nome: "Marco", cognome: "B", email: "scan_valid@e.it", cfHash: "idMarco"});
    const staff = await auth({role: "VALIDATOR", nome: "Gate", cognome: "Keeper", email: "scan_staff@e.it"});
    const {ticket} = await ticketFor(buyer);

    const token = (await get(`/tickets/${ticket.id}/access-token`, buyer.headers)).json().token as string;

    const first = await post("/validate/scan", {token}, staff.headers);
    expect(first.statusCode).toBe(200);
    expect(first.json().outcome).toBe("VALID");
    expect(first.json().holderName).toBe(ticket.holderName);

    const tickets = await get(`/accounts/${buyer.account.id}/tickets`, buyer.headers);
    expect(tickets.json()[0].status).toBe("BURNED");

    const fresh = (await get(`/tickets/${ticket.id}/access-token`, buyer.headers)).json().token as string;
    const second = await post("/validate/scan", {token: fresh}, staff.headers);
    expect(second.json().outcome).toBe("DUPLICATE");
  });

  it("POST /validate/scan: 401 senza token staff; token scaduto → SCREENSHOT; spazzatura → FAKE", async () => {
    const buyer = await auth({nome: "L", cognome: "R", email: "scan_misc@e.it", cfHash: "idLuca"});
    const staff = await auth({role: "VALIDATOR", nome: "Gate", cognome: "K", email: "scan_staff2@e.it"});
    const {ticket} = await ticketFor(buyer);

    // la rotta richiede autenticazione dello staff
    const noStaff = await post("/validate/scan", {token: signAccessToken(ticket.id)});
    expect(noStaff.statusCode).toBe(401);

    const expired = await post("/validate/scan", {token: signAccessToken(ticket.id, -10)}, staff.headers);
    expect(expired.json().outcome).toBe("SCREENSHOT");

    const fake = await post("/validate/scan", {token: "garbage"}, staff.headers);
    expect(fake.json().outcome).toBe("FAKE");
  });

  it("POST /validate/scan: scansioni CONCORRENTI dello stesso token → un solo VALID, l'altra DUPLICATE", async () => {
    const buyer = await auth({nome: "C", cognome: "C", email: "scan_conc@e.it", cfHash: "idConc"});
    const staffA = await auth({role: "VALIDATOR", nome: "Gate", cognome: "A", email: "scan_conc_a@e.it"});
    const staffB = await auth({role: "VALIDATOR", nome: "Gate", cognome: "B", email: "scan_conc_b@e.it"});
    const {ticket} = await ticketFor(buyer);
    const token = (await get(`/tickets/${ticket.id}/access-token`, buyer.headers)).json().token as string;

    // due varchi scansionano lo stesso QR nello stesso istante: mai due ingressi
    const [a, b] = await Promise.all([
      post("/validate/scan", {token}, staffA.headers),
      post("/validate/scan", {token}, staffB.headers)
    ]);
    const outcomes = [a.json().outcome, b.json().outcome].sort();
    expect(outcomes).toEqual(["DUPLICATE", "VALID"]);
  });

  it("finestra di rotazione: token entro il TTL → VALID; exp raggiunto → SCREENSHOT (mai VALID)", async () => {
    const buyer = await auth({nome: "R", cognome: "W", email: "scan_rot@e.it", cfHash: "idRot"});
    const staff = await auth({role: "VALIDATOR", nome: "Gate", cognome: "K", email: "scan_rot_s@e.it"});
    const {ticket} = await ticketFor(buyer);

    // il bordo esatto della finestra (exp == now) è già scaduto: screenshot
    const atBoundary = await post("/validate/scan", {token: signAccessToken(ticket.id, 0)}, staff.headers);
    expect(atBoundary.json().outcome).toBe("SCREENSHOT");

    // un token dentro la finestra (TTL ridotto) è valido
    const inWindow = await post("/validate/scan", {token: signAccessToken(ticket.id, 5)}, staff.headers);
    expect(inWindow.json().outcome).toBe("VALID");
  });

  it("token MANOMESSO (payload alterato, firma originale) → FAKE, non SCREENSHOT", async () => {
    const buyer = await auth({nome: "T", cognome: "M", email: "scan_tamper@e.it", cfHash: "idTamp"});
    const staff = await auth({role: "VALIDATOR", nome: "Gate", cognome: "K", email: "scan_tamper_s@e.it"});
    const {ticket} = await ticketFor(buyer);

    const token = (await get(`/tickets/${ticket.id}/access-token`, buyer.headers)).json().token as string;
    const [head, body, sig] = token.split(".") as [string, string, string];
    // allunga la scadenza nel payload tenendo la firma originale: la firma non torna → FAKE
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    payload.exp += 3600;
    const forged = `${head}.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${sig}`;

    const res = await post("/validate/scan", {token: forged}, staff.headers);
    expect(res.json().outcome).toBe("FAKE");
    // il biglietto resta ACTIVE: nessun ingresso consumato dal tentativo
    const tickets = await get(`/accounts/${buyer.account.id}/tickets`, buyer.headers);
    expect(tickets.json()[0].status).toBe("ACTIVE");
  });

  it("POST /validate/scan: token di un biglietto LISTED → ESCROW", async () => {
    const seller = await auth({nome: "S", cognome: "L", email: "scan_listed@e.it", cfHash: "idSara"});
    const staff = await auth({role: "VALIDATOR", nome: "Gate", cognome: "K", email: "scan_staff3@e.it"});
    const {ticket} = await ticketFor(seller);

    // mette in vendita (status → LISTED)
    const listed = await post(`/tickets/${ticket.id}/list`, {ownerId: seller.account.id, priceCents: 3200}, seller.headers);
    expect(listed.statusCode).toBe(201);

    const res = await post("/validate/scan", {token: signAccessToken(ticket.id)}, staff.headers);
    expect(res.json().outcome).toBe("ESCROW");
  });
});
