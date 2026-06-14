import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";

describe("API HTTP v2 (tier, ordini, mercato, OTP)", () => {
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
    role?: "CLIENTE" | "ORGANIZER";
    nome: string;
    cognome: string;
    email: string;
    cfHash?: string;
  }) {
    const account = (await post("/accounts", {...input, password: "1234"})).json();
    const token = (await post("/auth/login", {email: input.email, password: "1234"})).json().token as string;
    return {account, token, headers: {authorization: `Bearer ${token}`}};
  }

  async function org(email: string) {
    return auth({role: "ORGANIZER", nome: "O", cognome: "X", email});
  }
  async function event(o: {account: {id: string}; headers: Record<string, string>}, priceCents = 3_150, capacity = 50) {
    return (
      await post(
        "/events",
        {organizerId: o.account.id, title: "E", venue: "V", date: "D", priceCents, capacity},
        o.headers
      )
    ).json();
  }
  async function buyer(email: string, cfHash: string) {
    return auth({nome: "B", cognome: "Y", email, cfHash});
  }

  it("tier: crea ed elenca via HTTP; vuoto se assente", async () => {
    const o = await org("o-tier@e.it");
    const ev = await event(o);
    expect((await get(`/events/${ev.id}/tiers`)).json()).toEqual([]);
    const created = await post(`/events/${ev.id}/tiers`, {organizerId: o.account.id, name: "VIP", priceCents: 5_000}, o.headers);
    expect(created.statusCode).toBe(201);
    const list = await get(`/events/${ev.id}/tiers`);
    expect(list.json()).toHaveLength(1);
  });

  it("ordine: crea PENDING con breakdown, paga → biglietti + PAID; idempotente", async () => {
    const o = await org("o-ord@e.it");
    const ev = await event(o);
    const b = await buyer("b-ord@e.it", "idOrd");

    const ordRes = await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 2}, b.headers);
    expect(ordRes.statusCode).toBe(201);
    const order = ordRes.json();
    expect(order.status).toBe("PENDING");
    expect(order.totalCents).toBe(6_930); // (3150 + prevendita 10% 315) × 2

    const payRes = await post(`/orders/${order.id}/pay`, {}, b.headers);
    expect(payRes.statusCode).toBe(200);
    expect(payRes.json().status).toBe("PAID");
    expect(payRes.json().ticketIds).toHaveLength(2);

    const tickets = await get(`/accounts/${b.account.id}/tickets`, b.headers);
    expect(tickets.json()).toHaveLength(2);

    // idempotente
    await post(`/orders/${order.id}/pay`, {}, b.headers);
    expect((await get(`/accounts/${b.account.id}/tickets`, b.headers)).json()).toHaveLength(2);

    const orders = await get(`/accounts/${b.account.id}/orders`, b.headers);
    expect(orders.json()).toHaveLength(1);
  });

  it("ordine oltre l'allowance → 409 EVENT_LIMIT", async () => {
    const o = await org("o-lim@e.it");
    const ev = await event(o);
    const b = await buyer("b-lim@e.it", "idLim");
    const first = (await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 1}, b.headers)).json();
    await post(`/orders/${first.id}/pay`, {}, b.headers);
    const tooMany = await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 2}, b.headers);
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json().error).toBe("EVENT_LIMIT");
  });

  it("mercato: list, listing visibile, buy trasferisce e azzera il listino", async () => {
    const o = await org("o-mkt@e.it");
    const ev = await event(o);
    const seller = await buyer("seller-mkt@e.it", "idSeller");
    const buyerAcc = await buyer("buyer-mkt@e.it", "idBuyer");

    const order = (await post("/orders", {buyerId: seller.account.id, eventId: ev.id, quantity: 1}, seller.headers)).json();
    const paid = (await post(`/orders/${order.id}/pay`, {}, seller.headers)).json();
    const ticketId = paid.ticketIds[0];

    const listed = await post(`/tickets/${ticketId}/list`, {ownerId: seller.account.id, priceCents: 3_000}, seller.headers);
    expect(listed.statusCode).toBe(201);
    expect(listed.json().status).toBe("LISTED");

    const market = await get("/market");
    expect(market.json()).toHaveLength(1);
    expect(market.json()[0].askPriceCents).toBe(3_000);
    expect(market.json()[0].royaltyCents).toBe(31);

    const bought = await post(`/market/${ticketId}/buy`, {buyerId: buyerAcc.account.id}, buyerAcc.headers);
    expect(bought.statusCode).toBe(200);
    expect(bought.json().ticket.ownerId).toBe(buyerAcc.account.id);
    expect(bought.json().paidByBuyerCents).toBe(3_031);
    expect((await get("/market")).json()).toHaveLength(0);
  });

  it("OTP: register/email → verify con codice giusto crea account; codice errato 400", async () => {
    const reg = await post("/auth/register/email", {nome: "Marco", cognome: "B", cf: "BNCMRC90A01F205X", email: "otp@e.it"});
    expect(reg.statusCode).toBe(201);
    const devCode = reg.json().devCode;
    expect(devCode).toMatch(/^\d{6}$/);

    const bad = await post("/auth/register/email/verify", {email: "otp@e.it", code: "000000"});
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("BAD_CODE");

    const ok = await post("/auth/register/email/verify", {email: "otp@e.it", code: devCode});
    expect(ok.statusCode).toBe(201);
    expect(ok.json().verified).toBe(true);
    expect(ok.json().cfHash).toMatch(/^0x/);
  });
});
