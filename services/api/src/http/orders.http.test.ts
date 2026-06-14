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

  async function post(url: string, payload: unknown) {
    return app.inject({method: "POST", url, payload: payload as object});
  }
  async function get(url: string) {
    return app.inject({method: "GET", url});
  }

  async function org(email: string) {
    return (await post("/accounts", {role: "ORGANIZER", nome: "O", cognome: "X", email})).json();
  }
  async function event(orgId: string, priceCents = 3_150, capacity = 50) {
    return (await post("/events", {organizerId: orgId, title: "E", venue: "V", date: "D", priceCents, capacity})).json();
  }
  async function buyer(email: string, cfHash: string) {
    return (await post("/accounts", {nome: "B", cognome: "Y", email, cfHash})).json();
  }

  it("tier: crea ed elenca via HTTP; vuoto se assente", async () => {
    const o = await org("o-tier@e.it");
    const ev = await event(o.id);
    expect((await get(`/events/${ev.id}/tiers`)).json()).toEqual([]);
    const created = await post(`/events/${ev.id}/tiers`, {organizerId: o.id, name: "VIP", priceCents: 5_000});
    expect(created.statusCode).toBe(201);
    const list = await get(`/events/${ev.id}/tiers`);
    expect(list.json()).toHaveLength(1);
  });

  it("ordine: crea PENDING con breakdown, paga → biglietti + PAID; idempotente", async () => {
    const o = await org("o-ord@e.it");
    const ev = await event(o.id);
    const b = await buyer("b-ord@e.it", "idOrd");

    const ordRes = await post("/orders", {buyerId: b.id, eventId: ev.id, quantity: 2});
    expect(ordRes.statusCode).toBe(201);
    const order = ordRes.json();
    expect(order.status).toBe("PENDING");
    expect(order.totalCents).toBe(6_930); // (3150 + prevendita 10% 315) × 2

    const payRes = await post(`/orders/${order.id}/pay`, {});
    expect(payRes.statusCode).toBe(200);
    expect(payRes.json().status).toBe("PAID");
    expect(payRes.json().ticketIds).toHaveLength(2);

    const tickets = await get(`/accounts/${b.id}/tickets`);
    expect(tickets.json()).toHaveLength(2);

    // idempotente
    await post(`/orders/${order.id}/pay`, {});
    expect((await get(`/accounts/${b.id}/tickets`)).json()).toHaveLength(2);

    const orders = await get(`/accounts/${b.id}/orders`);
    expect(orders.json()).toHaveLength(1);
  });

  it("ordine oltre l'allowance → 409 EVENT_LIMIT", async () => {
    const o = await org("o-lim@e.it");
    const ev = await event(o.id);
    const b = await buyer("b-lim@e.it", "idLim");
    await post(`/orders/${(await post("/orders", {buyerId: b.id, eventId: ev.id, quantity: 1})).json().id}/pay`, {});
    const tooMany = await post("/orders", {buyerId: b.id, eventId: ev.id, quantity: 2});
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json().error).toBe("EVENT_LIMIT");
  });

  it("mercato: list, listing visibile, buy trasferisce e azzera il listino", async () => {
    const o = await org("o-mkt@e.it");
    const ev = await event(o.id);
    const seller = await buyer("seller-mkt@e.it", "idSeller");
    const buyerAcc = await buyer("buyer-mkt@e.it", "idBuyer");

    const order = (await post("/orders", {buyerId: seller.id, eventId: ev.id, quantity: 1})).json();
    const paid = (await post(`/orders/${order.id}/pay`, {})).json();
    const ticketId = paid.ticketIds[0];

    const listed = await post(`/tickets/${ticketId}/list`, {ownerId: seller.id, priceCents: 3_000});
    expect(listed.statusCode).toBe(201);
    expect(listed.json().status).toBe("LISTED");

    const market = await get("/market");
    expect(market.json()).toHaveLength(1);
    expect(market.json()[0].askPriceCents).toBe(3_000);
    expect(market.json()[0].royaltyCents).toBe(31);

    const bought = await post(`/market/${ticketId}/buy`, {buyerId: buyerAcc.id});
    expect(bought.statusCode).toBe(200);
    expect(bought.json().ticket.ownerId).toBe(buyerAcc.id);
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
