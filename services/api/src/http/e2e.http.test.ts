import {afterAll, beforeAll, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";

/**
 * E2E black-box: un solo server (store in-memory) e una narrazione completa via HTTP,
 * dal primo acquisto alla validazione, rivendita, payout e rimborso. Funge anche da
 * documentazione vivente dei contratti delle rotte. `rateLimit:false` per non
 * interferire con la sequenza serrata di chiamate.
 */
const ADMIN = {"x-admin-token": "dev-admin"};

describe("E2E — percorso completo via HTTP", () => {
  let app: FastifyInstance;
  beforeAll(() => {
    app = buildServer({rateLimit: false});
  });
  afterAll(async () => {
    await app.close();
  });

  const post = (url: string, payload: unknown, headers?: Record<string, string>) =>
    app.inject({method: "POST", url, payload: payload as object, headers});
  const get = (url: string, headers?: Record<string, string>) => app.inject({method: "GET", url, headers});

  async function auth(input: {role?: "CLIENTE" | "ORGANIZER" | "VALIDATOR"; nome: string; email: string; cfHash?: string}) {
    const account = (await post("/accounts", {cognome: "X", ...input, password: "1234"})).json();
    const token = (await post("/auth/login", {email: input.email, password: "1234"})).json().token as string;
    return {account, headers: {authorization: `Bearer ${token}`}};
  }

  it("acquisto → validazione → rivendita → payout → rimborso, end-to-end", async () => {
    // -- attori (identità distinte per non incrociare il limite 2/evento)
    const org = await auth({role: "ORGANIZER", nome: "Org", email: "e2e-org@e.it"});
    const staff = await auth({role: "VALIDATOR", nome: "Gate", email: "e2e-staff@e.it"});
    const alice = await auth({nome: "Alice", email: "e2e-alice@e.it", cfHash: "idAlice"});
    const seller = await auth({nome: "Seller", email: "e2e-seller@e.it", cfHash: "idSeller"});
    const bob = await auth({nome: "Bob", email: "e2e-bob@e.it", cfHash: "idBob"});
    const carol = await auth({nome: "Carol", email: "e2e-carol@e.it", cfHash: "idCarol"});

    // -- evento
    const ev = (
      await post("/events", {organizerId: org.account.id, title: "Notte E2E", venue: "Hangar", date: "21 GIU", priceCents: 3_150, capacity: 50}, org.headers)
    ).json();

    // == 1) Alice: ordine → checkout PSP → webhook → PAID + biglietto ==
    const o1 = (await post("/orders", {buyerId: alice.account.id, eventId: ev.id, quantity: 1}, alice.headers)).json();
    expect(o1.status).toBe("PENDING");
    expect(o1.totalCents).toBe(3_465); // 3150 + prevendita 10% (315)
    const co = (await post(`/orders/${o1.id}/checkout`, {}, alice.headers)).json();
    expect(co.checkoutUrl).toMatch(/^https?:\/\//);
    const hook = await post("/webhooks/psp", {id: "evt_e2e_1", type: "payment_succeeded", providerRef: co.providerRef, orderId: o1.id});
    expect(hook.json().handled).toBe(true);
    const o1paid = (await get(`/orders/${o1.id}`, alice.headers)).json();
    expect(o1paid.status).toBe("PAID");
    const t1 = o1paid.ticketIds[0];
    expect((await get(`/accounts/${alice.account.id}/tickets`, alice.headers)).json()).toHaveLength(1);

    // == 2) validazione al varco: QR rotante → VALID, poi DUPLICATE ==
    const tok1 = (await get(`/tickets/${t1}/access-token`, alice.headers)).json();
    expect(tok1.token.split(".")).toHaveLength(3);
    expect(tok1.rotateSeconds).toBeGreaterThan(0);
    const scan1 = await post("/validate/scan", {token: tok1.token}, staff.headers);
    expect(scan1.json().outcome).toBe("VALID");
    const tok1b = (await get(`/tickets/${t1}/access-token`, alice.headers)).json().token;
    expect((await post("/validate/scan", {token: tok1b}, staff.headers)).json().outcome).toBe("DUPLICATE");

    // == 3) mercato secondario: seller lista, bob compra (royalty 1%) ==
    const o2 = (await post("/orders", {buyerId: seller.account.id, eventId: ev.id, quantity: 1}, seller.headers)).json();
    const t2 = (await post(`/orders/${o2.id}/pay`, {}, seller.headers)).json().ticketIds[0];
    const listed = await post(`/tickets/${t2}/list`, {ownerId: seller.account.id, priceCents: 3_000}, seller.headers);
    expect(listed.json().status).toBe("LISTED");
    const market = (await get("/market")).json();
    expect(market).toHaveLength(1);
    expect(market[0].royaltyCents).toBe(31); // 1% di 3150
    const bought = await post(`/market/${t2}/buy`, {buyerId: bob.account.id}, bob.headers);
    expect(bought.json().ticket.ownerId).toBe(bob.account.id);
    expect(bought.json().paidByBuyerCents).toBe(3_031); // 3000 + royalty 31
    expect((await get("/market")).json()).toHaveLength(0);

    // == 4) payout venditore: pendente → liquidato ==
    const payouts = (await get("/platform/payouts", ADMIN)).json();
    expect(payouts).toHaveLength(1);
    expect(payouts[0].sellerId).toBe(seller.account.id);
    expect(payouts[0].amountCents).toBe(3_000);
    const settle = await post(`/payouts/${payouts[0].transferId}/settle`, {}, ADMIN);
    expect(settle.statusCode).toBe(200);
    expect((await get("/platform/payouts", ADMIN)).json()).toHaveLength(0);

    // == 5) rimborso (piattaforma): revoca il biglietto → niente rivendita, niente ingresso ==
    const o3 = (await post("/orders", {buyerId: carol.account.id, eventId: ev.id, quantity: 1}, carol.headers)).json();
    const t3 = (await post(`/orders/${o3.id}/pay`, {}, carol.headers)).json().ticketIds[0];
    // self non può rimborsare (storna ricavi TINFT): serve la piattaforma
    expect((await post(`/orders/${o3.id}/refund`, {}, carol.headers)).statusCode).toBe(403);
    expect((await post(`/orders/${o3.id}/refund`, {}, ADMIN)).statusCode).toBe(200);
    expect((await get(`/orders/${o3.id}`, carol.headers)).json().refundedAt).toBeTruthy();
    // biglietto revocato: non rivendibile (409) e non valido al varco (FAKE)
    expect((await post(`/tickets/${t3}/list`, {ownerId: carol.account.id, priceCents: 3_000}, carol.headers)).statusCode).toBe(409);
    const tok3 = (await get(`/tickets/${t3}/access-token`, carol.headers)).json().token;
    expect((await post("/validate/scan", {token: tok3}, staff.headers)).json().outcome).toBe("FAKE");
  });

  it("documentazione + osservabilità: /openapi.json, /docs, /metrics", async () => {
    const spec = await get("/openapi.json");
    expect(spec.statusCode).toBe(200);
    expect(spec.json().openapi).toBe("3.1.0");
    expect(spec.json().paths["/orders"]).toBeDefined();
    expect(spec.json().paths["/validate/scan"]).toBeDefined();

    const docs = await get("/docs");
    expect(docs.statusCode).toBe(200);
    expect(docs.headers["content-type"]).toContain("text/html");
    expect(docs.body).toContain("swagger-ui");

    const metrics = await get("/metrics");
    expect(metrics.body).toContain("tinft_http_requests_total");
  });
});
