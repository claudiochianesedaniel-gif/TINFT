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

  const ADMIN = {"x-admin-token": "dev-admin"};

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
  async function event(
    o: {account: {id: string}; headers: Record<string, string>},
    priceCents = 3_150,
    capacity = 50,
    status?: string
  ) {
    return (
      await post(
        "/events",
        {organizerId: o.account.id, title: "E", venue: "V", date: "D", priceCents, capacity, status},
        o.headers
      )
    ).json();
  }
  async function buyer(email: string, cfHash: string) {
    return auth({nome: "B", cognome: "Y", email, cfHash});
  }

  // -------------------------------------------------------------------- B5
  it("B5 artisti: lista + follow incrementa", async () => {
    const u = await auth({nome: "U", cognome: "Z", email: "fan@e.it"});
    const list = await get("/artists");
    expect(list.statusCode).toBe(200);
    expect(list.json().length).toBeGreaterThanOrEqual(4);
    const first = list.json()[0];
    const followed = await post(`/artists/${first.id}/follow`, {}, u.headers);
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
    const ev = await event(o);
    const b = await buyer("b-dash@e.it", "idDash");
    const order = (await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 2}, b.headers)).json();
    await post(`/orders/${order.id}/pay`, {}, b.headers);

    const d = await get(`/organizers/${o.account.id}/dashboard`, o.headers);
    expect(d.statusCode).toBe(200);
    expect(d.json().grossCents).toBe(6_300);
    expect(d.json().ticketsSold).toBe(2);
    expect(d.json().eventsOnSale).toBe(1);
  });

  it("B6 incassi: net = gross + royalty org", async () => {
    const o = await org("o-inc@e.it");
    const ev = await event(o);
    const b = await buyer("b-inc@e.it", "idInc");
    const order = (await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 1}, b.headers)).json();
    await post(`/orders/${order.id}/pay`, {}, b.headers);

    const inc = await get(`/organizers/${o.account.id}/incassi`, o.headers);
    expect(inc.statusCode).toBe(200);
    expect(inc.json().grossCents).toBe(3_150);
    expect(inc.json().netCents).toBe(3_150); // nessuna royalty ancora, nessuna trattenuta TINFT
    expect(inc.json().payoutEta).toBe("entro 72h dalla fine evento");
  });

  it("B6 accessi: mostra le entrate dopo una validazione", async () => {
    const o = await org("o-acc@e.it");
    const ev = await event(o);
    const b = await buyer("b-acc@e.it", "idAcc");
    const order = (await post("/orders", {buyerId: b.account.id, eventId: ev.id, quantity: 1}, b.headers)).json();
    const paid = (await post(`/orders/${order.id}/pay`, {}, b.headers)).json();
    await post(`/tickets/${paid.ticketIds[0]}/validate`, {}, b.headers);

    const acc = await get(`/events/${ev.id}/accessi`, o.headers);
    expect(acc.statusCode).toBe(200);
    expect(acc.json().capacity).toBe(50);
    expect(acc.json().validated).toBe(1);
    expect(acc.json().recentEntries).toHaveLength(1);
    expect(acc.json().recentEntries[0].outcome).toBe("VALID");
  });

  it("B6 varchi: crea + elenca; non-owner 403", async () => {
    const o = await org("o-gate@e.it");
    const ev = await event(o);
    const created = await post(`/events/${ev.id}/validators`, {organizerId: o.account.id}, o.headers);
    expect(created.statusCode).toBe(201);
    expect(created.json().code).toMatch(/^VARCO-\d{4}$/);
    const list = await get(`/events/${ev.id}/validators`, o.headers);
    expect(list.json()).toHaveLength(1);

    const other = await org("o-gate2@e.it");
    const denied = await post(`/events/${ev.id}/validators`, {organizerId: other.account.id}, other.headers);
    expect(denied.statusCode).toBe(403);
  });

  it("B6 platform revenue: riflette il ledger dopo pay + market buy + export libero", async () => {
    const o = await org("o-plat@e.it");
    const ev = await event(o);
    const seller = await buyer("seller-plat@e.it", "idSellerP");
    const buyerAcc = await buyer("buyer-plat@e.it", "idBuyerP");

    // primario: presale 10% di 3150 = 315
    const order = (await post("/orders", {buyerId: seller.account.id, eventId: ev.id, quantity: 1}, seller.headers)).json();
    const paid = (await post(`/orders/${order.id}/pay`, {}, seller.headers)).json();
    const ticketId = paid.ticketIds[0];
    // secondario su biglietto ATTIVO: fee 1% di 3150 = 31 → TUTTA a TINFT
    await post(`/tickets/${ticketId}/list`, {ownerId: seller.account.id, priceCents: 3_000}, seller.headers);
    await post(`/market/${ticketId}/buy`, {buyerId: buyerAcc.account.id}, buyerAcc.headers);
    // export libero del SOPRAVVISSUTO (non entra): a evento concluso, fee d'uscita 25% di 3150 = 787
    await post(`/events/${ev.id}/conclude`, {organizerId: o.account.id}, o.headers);
    await post(`/tickets/${ticketId}/export`, {ownerId: buyerAcc.account.id, mode: "FREE"}, buyerAcc.headers);

    const rev = await get("/platform/revenue", ADMIN);
    expect(rev.statusCode).toBe(200);
    expect(rev.json().presaleCommissionCents).toBe(315);
    expect(rev.json().royaltyTinftCents).toBe(31);
    expect(rev.json().exitFeeCents).toBe(787);
    expect(rev.json().totalCents).toBe(315 + 31 + 787);
    expect(rev.json().gmvPrimaryCents).toBe(3_150);
    expect(rev.json().p2pCount).toBe(1);
  });

  // -------------------------------------------------------------------- B7
  it("B7 publish bloccato senza KYC verificato; submit→decision(VERIFIED)→publish ok", async () => {
    const o = await org("o-pub@e.it");
    const ev = await event(o, 3_150, 50, "DRAFT");
    expect(ev.status).toBe("DRAFT");

    // publish bloccato: KYC NONE
    const blocked = await post(`/events/${ev.id}/publish`, {organizerId: o.account.id}, o.headers);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error).toBe("KYC_REQUIRED");

    // submit KYC → PENDING
    const submitted = await post(`/organizers/${o.account.id}/kyc/submit`, {}, o.headers);
    expect(submitted.json().kycStatus).toBe("PENDING");

    // decisione senza token admin → 403
    const noTok = await post(`/organizers/${o.account.id}/kyc/decision`, {decision: "VERIFIED"});
    expect(noTok.statusCode).toBe(403);

    // decisione VERIFIED col token admin
    const decided = await post(`/organizers/${o.account.id}/kyc/decision`, {decision: "VERIFIED"}, ADMIN);
    expect(decided.statusCode).toBe(200);
    expect(decided.json().kycStatus).toBe("VERIFIED");

    // ora publish funziona
    const published = await post(`/events/${ev.id}/publish`, {organizerId: o.account.id}, o.headers);
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe("ON_SALE");
  });

  it("B7 publish: solo l'org proprietario", async () => {
    const o = await org("o-pub2@e.it");
    const ev = await event(o, 3_150, 50, "DRAFT");
    await post(`/organizers/${o.account.id}/kyc/submit`, {}, o.headers);
    await post(`/organizers/${o.account.id}/kyc/decision`, {decision: "VERIFIED"}, ADMIN);
    const other = await org("o-pub3@e.it");
    // other tenta di pubblicare l'evento di o passando il PROPRIO organizerId → ownership ok al bordo,
    // ma il service rifiuta perché non è il proprietario dell'evento (NOT_OWNER).
    const denied = await post(`/events/${ev.id}/publish`, {organizerId: other.account.id}, other.headers);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("NOT_OWNER");
  });

  it("B7 club: i dati di fatturazione vengono persistiti", async () => {
    const o = await org("o-club@e.it");
    const res = await post(
      "/clubs",
      {
        organizerId: o.account.id,
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
      },
      o.headers
    );
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
