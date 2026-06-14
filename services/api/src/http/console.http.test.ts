import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";

describe("API HTTP v2 — content / console / KYC (B5–B7)", () => {
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
  async function get(url: string) {
    return app.inject({method: "GET", url});
  }
  async function org(email: string) {
    return (await post("/accounts", {role: "ORGANIZER", nome: "O", cognome: "X", email})).json();
  }
  async function event(orgId: string, priceCents = 3_150, capacity = 50, status?: string) {
    return (await post("/events", {organizerId: orgId, title: "E", venue: "V", date: "D", priceCents, capacity, status})).json();
  }
  async function buyer(email: string, cfHash: string) {
    return (await post("/accounts", {nome: "B", cognome: "Y", email, cfHash})).json();
  }

  // -------------------------------------------------------------------- B5
  it("B5 artisti: lista + follow incrementa", async () => {
    const list = await get("/artists");
    expect(list.statusCode).toBe(200);
    expect(list.json().length).toBeGreaterThanOrEqual(4);
    const first = list.json()[0];
    const followed = await post(`/artists/${first.id}/follow`, {});
    expect(followed.statusCode).toBe(200);
    expect(followed.json().followers).toBe(first.followers + 1);
  });

  it("B5 blog: lista + by-slug + 404; news: lista", async () => {
    const blog = await get("/blog");
    expect(blog.json()).toHaveLength(3);
    const slug = blog.json()[0].slug;
    const one = await get(`/blog/${slug}`);
    expect(one.statusCode).toBe(200);
    expect(one.json().slug).toBe(slug);
    const missing = await get("/blog/non-esiste");
    expect(missing.statusCode).toBe(404);

    const news = await get("/news");
    expect(news.json().length).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------- B6
  it("B6 dashboard: numeri per un org con biglietti venduti", async () => {
    const o = await org("o-dash@e.it");
    const ev = await event(o.id);
    const b = await buyer("b-dash@e.it", "idDash");
    await post(`/orders/${(await post("/orders", {buyerId: b.id, eventId: ev.id, quantity: 2})).json().id}/pay`, {});

    const d = await get(`/organizers/${o.id}/dashboard`);
    expect(d.statusCode).toBe(200);
    expect(d.json().grossCents).toBe(6_300);
    expect(d.json().ticketsSold).toBe(2);
    expect(d.json().eventsOnSale).toBe(1);
  });

  it("B6 incassi: net = gross + royalty org", async () => {
    const o = await org("o-inc@e.it");
    const ev = await event(o.id);
    const b = await buyer("b-inc@e.it", "idInc");
    await post(`/orders/${(await post("/orders", {buyerId: b.id, eventId: ev.id, quantity: 1})).json().id}/pay`, {});

    const inc = await get(`/organizers/${o.id}/incassi`);
    expect(inc.statusCode).toBe(200);
    expect(inc.json().grossCents).toBe(3_150);
    expect(inc.json().netCents).toBe(3_150); // nessuna royalty ancora, nessuna trattenuta TINFT
    expect(inc.json().payoutEta).toBe("entro 72h dalla fine evento");
  });

  it("B6 accessi: mostra le entrate dopo una validazione", async () => {
    const o = await org("o-acc@e.it");
    const ev = await event(o.id);
    const b = await buyer("b-acc@e.it", "idAcc");
    const paid = (await post(`/orders/${(await post("/orders", {buyerId: b.id, eventId: ev.id, quantity: 1})).json().id}/pay`, {})).json();
    await post(`/tickets/${paid.ticketIds[0]}/validate`, {});

    const acc = await get(`/events/${ev.id}/accessi`);
    expect(acc.statusCode).toBe(200);
    expect(acc.json().capacity).toBe(50);
    expect(acc.json().validated).toBe(1);
    expect(acc.json().recentEntries).toHaveLength(1);
    expect(acc.json().recentEntries[0].outcome).toBe("VALID");
  });

  it("B6 varchi: crea + elenca; non-owner 403", async () => {
    const o = await org("o-gate@e.it");
    const ev = await event(o.id);
    const created = await post(`/events/${ev.id}/validators`, {organizerId: o.id});
    expect(created.statusCode).toBe(201);
    expect(created.json().code).toMatch(/^VARCO-\d{4}$/);
    const list = await get(`/events/${ev.id}/validators`);
    expect(list.json()).toHaveLength(1);

    const other = await org("o-gate2@e.it");
    const denied = await post(`/events/${ev.id}/validators`, {organizerId: other.id});
    expect(denied.statusCode).toBe(403);
  });

  it("B6 platform revenue: riflette il ledger dopo pay + market buy + export libero", async () => {
    const o = await org("o-plat@e.it");
    const ev = await event(o.id);
    const seller = await buyer("seller-plat@e.it", "idSellerP");
    const buyerAcc = await buyer("buyer-plat@e.it", "idBuyerP");

    // primario: presale 10% di 3150 = 315
    const paid = (await post(`/orders/${(await post("/orders", {buyerId: seller.id, eventId: ev.id, quantity: 1})).json().id}/pay`, {})).json();
    const ticketId = paid.ticketIds[0];
    // secondario: royalty 1% di 3150 = 31 → TINFT 15
    await post(`/tickets/${ticketId}/list`, {ownerId: seller.id, priceCents: 3_000});
    await post(`/market/${ticketId}/buy`, {buyerId: buyerAcc.id});
    // export libero: 25% di 3150 = 787 (serve biglietto USED)
    await post(`/tickets/${ticketId}/validate`, {});
    await post(`/tickets/${ticketId}/export`, {ownerId: buyerAcc.id, mode: "FREE"});

    const rev = await get("/platform/revenue");
    expect(rev.statusCode).toBe(200);
    expect(rev.json().presaleCommissionCents).toBe(315);
    expect(rev.json().royaltyTinftCents).toBe(15);
    expect(rev.json().exitFeeCents).toBe(787);
    expect(rev.json().totalCents).toBe(315 + 15 + 787);
    expect(rev.json().gmvPrimaryCents).toBe(3_150);
    expect(rev.json().p2pCount).toBe(1);
  });

  // -------------------------------------------------------------------- B7
  it("B7 publish bloccato senza KYC verificato; submit→decision(VERIFIED)→publish ok", async () => {
    const o = await org("o-pub@e.it");
    const ev = await event(o.id, 3_150, 50, "DRAFT");
    expect(ev.status).toBe("DRAFT");

    // publish bloccato: KYC NONE
    const blocked = await post(`/events/${ev.id}/publish`, {organizerId: o.id});
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error).toBe("KYC_REQUIRED");

    // submit KYC → PENDING
    const submitted = await post(`/organizers/${o.id}/kyc/submit`, {});
    expect(submitted.json().kycStatus).toBe("PENDING");

    // decisione senza token admin → 403
    const noTok = await post(`/organizers/${o.id}/kyc/decision`, {decision: "VERIFIED"});
    expect(noTok.statusCode).toBe(403);

    // decisione VERIFIED col token admin
    const decided = await post(`/organizers/${o.id}/kyc/decision`, {decision: "VERIFIED"}, {"x-admin-token": "dev-admin"});
    expect(decided.statusCode).toBe(200);
    expect(decided.json().kycStatus).toBe("VERIFIED");

    // ora publish funziona
    const published = await post(`/events/${ev.id}/publish`, {organizerId: o.id});
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe("ON_SALE");
  });

  it("B7 publish: solo l'org proprietario", async () => {
    const o = await org("o-pub2@e.it");
    const ev = await event(o.id, 3_150, 50, "DRAFT");
    await post(`/organizers/${o.id}/kyc/submit`, {});
    await post(`/organizers/${o.id}/kyc/decision`, {decision: "VERIFIED"}, {"x-admin-token": "dev-admin"});
    const other = await org("o-pub3@e.it");
    const denied = await post(`/events/${ev.id}/publish`, {organizerId: other.id});
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("NOT_OWNER");
  });

  it("B7 club: i dati di fatturazione vengono persistiti", async () => {
    const o = await org("o-club@e.it");
    const res = await post("/clubs", {
      organizerId: o.id,
      name: "Club Astra",
      city: "Milano",
      fidelityPriceCents: 12_000,
      fidelityUses: 5,
      ragioneSociale: "Astra S.r.l.",
      piva: "IT01234567890",
      sedeLegale: "Via Roma 1, Milano",
      pec: "astra@pec.it",
      sdi: "ABCDEFG",
      iban: "IT60X0542811101000000123456",
      genre: "Techno",
      color: "#2f4f8a"
    });
    expect(res.statusCode).toBe(201);
    const club = res.json();
    expect(club.ragioneSociale).toBe("Astra S.r.l.");
    expect(club.piva).toBe("IT01234567890");
    expect(club.iban).toBe("IT60X0542811101000000123456");
    expect(club.genre).toBe("Techno");
    expect(club.color).toBe("#2f4f8a");
    // e i campi esistenti restano
    expect(club.name).toBe("Club Astra");
    expect(club.fidelityUses).toBe(5);

    // riletto da GET /clubs/:id
    const fetched = await get(`/clubs/${club.id}`);
    expect(fetched.json().pec).toBe("astra@pec.it");
    expect(fetched.json().sdi).toBe("ABCDEFG");
  });
});
