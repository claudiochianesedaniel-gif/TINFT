import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {PrismaClient} from "@prisma/client";
import {PrismaStore} from "./prisma-store";
import {TicketingService} from "../services/ticketing";
import {ConsoleService} from "../services/console";
import {ContentService} from "../services/content";
import {PaymentsService} from "../payments/service";
import {FakeProvider} from "../payments/provider";
import {FakeChain} from "../chain/fake";
import {GOODWILL_PER_TICKET} from "../domain/rules";

/**
 * Test di integrazione su PostgreSQL: gira SOLO se DATABASE_URL è impostata.
 * Tronca le tabelle pubbliche, poi guida un flusso completo contro PrismaStore/PG
 * (account, club, evento+fascia, ordine, pagamento/mint, mercato, validazione,
 * console, contenuti) verificando i risultati e la persistenza su DB.
 */
const RUN = !!process.env.DATABASE_URL;

describe.skipIf(!RUN)("PrismaStore — integrazione PostgreSQL", () => {
  let prisma: PrismaClient;
  let store: PrismaStore;

  beforeAll(async () => {
    prisma = new PrismaClient();
    store = new PrismaStore(prisma);
    // azzera le tabelle (ordine indifferente con CASCADE)
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Validation","Validator","Transfer","Ticket","Order","Tier","Event",
        "Club","Organizer","Account","Payment","PendingRegistration",
        "ProcessedWebhook","PlatformLedger","Artist","BlogPost","News"
      RESTART IDENTITY CASCADE;
    `);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("flusso completo primario → mercato → validazione → console + contenuti", async () => {
    const clock = {t: 1000};
    const ticketing = new TicketingService(store, () => clock.t);
    const consoleSvc = new ConsoleService(store);
    const content = new ContentService(store);

    // -------- account: organizzatore (KYC verificato) + due client verificati
    const org = await ticketing.createAccount({role: "ORGANIZER", nome: "Club", cognome: "Astra", email: "org@pg.io"});
    org.kycStatus = "VERIFIED";
    await store.updateAccount(org);
    const seller = await ticketing.createAccount({nome: "Sara", cognome: "S", email: "seller@pg.io", cfHash: "0xpgseller"});
    const buyer = await ticketing.createAccount({nome: "Luca", cognome: "L", email: "buyer@pg.io", cfHash: "0xpgbuyer"});

    // persistenza account su PG
    expect(await prisma.account.count()).toBe(3);
    expect((await store.getAccountByEmail("ORG@PG.IO"))?.id).toBe(org.id);

    // -------- club + evento + fascia
    const club = await ticketing.createClub({
      organizerId: org.id, name: "Astra", city: "Milano",
      ragioneSociale: "Astra S.r.l.", piva: "ITPG123", iban: "ITPGIBAN", genre: "Techno", color: "#2f4f8a"
    });
    expect((await store.getClub(club.id))?.iban).toBe("ITPGIBAN");

    const event = await ticketing.createEvent({
      organizerId: org.id, clubId: club.id, title: "Notte PG", venue: "Magazzino",
      date: "21 GIU", priceCents: 3_150, capacity: 100, status: "ON_SALE"
    });
    const tier = await ticketing.createTier(event.id, {organizerId: org.id, name: "Intero", priceCents: 3_150});
    expect((await ticketing.listTiers(event.id))).toHaveLength(1);
    expect(tier.eventId).toBe(event.id);
    expect(await prisma.event.count()).toBe(1);

    // -------- ordine (presale 10% + totale) — il venditore compra 1
    const order = await ticketing.createOrder({buyerId: seller.id, eventId: event.id, quantity: 1});
    expect(order.unitPriceCents).toBe(3_150);
    expect(order.presaleCommissionCents).toBe(315); // 10% di 3150
    expect(order.feeTotalCents).toBe(315);
    expect(order.subtotalCents).toBe(3_150);
    expect(order.totalCents).toBe(3_465); // (3150 + 315) × 1
    expect(order.status).toBe("PENDING");

    // -------- pay → mint biglietti
    const paid = await ticketing.payOrder(order.id);
    expect(paid.status).toBe("PAID");
    expect(paid.ticketIds).toHaveLength(1);
    const ticketId = paid.ticketIds[0]!;
    expect(await prisma.ticket.count()).toBe(1);
    // venduto incrementato e persistito
    expect((await ticketing.getEvent(event.id)).sold).toBe(1);
    // goodwill al compratore persistito
    expect((await store.getAccount(seller.id))?.goodwill).toBe(GOODWILL_PER_TICKET);
    // l'ordine ricostruisce ticketIds da DB
    expect((await ticketing.getOrder(order.id)).ticketIds).toEqual([ticketId]);

    // -------- list sul mercato
    const listed = await ticketing.listTicket(ticketId, seller.id, 3_000);
    expect(listed.status).toBe("LISTED");
    expect(listed.askPriceCents).toBe(3_000);
    const market = await ticketing.market();
    expect(market).toHaveLength(1);
    expect(market[0]!.askPriceCents).toBe(3_000);
    expect(market[0]!.royaltyCents).toBe(31); // 1% di 3150

    // -------- buy dal mercato (royalty split + spostamento proprietà)
    const sellerGoodwillBefore = (await store.getAccount(seller.id))!.goodwill;
    const res = await ticketing.buyFromMarket(ticketId, buyer.id);
    expect(res.royalty).toEqual({tinftCents: 15, organizerCents: 16}); // 31 → 15/16
    expect(res.paidByBuyerCents).toBe(3_000 + 31);
    expect(res.ticket.ownerId).toBe(buyer.id);
    expect(res.ticket.paidCents).toBe(3_000); // costo base viaggia col token
    expect(res.ticket.status).toBe("ACTIVE");
    // proprietà spostata, persistita su PG
    expect((await store.getTicket(ticketId))?.ownerId).toBe(buyer.id);
    expect(await ticketing.ticketsOf(buyer.id)).toHaveLength(1);
    expect(await ticketing.ticketsOf(seller.id)).toHaveLength(0);
    // goodwill venditore +round(3000/100)=30
    expect((await store.getAccount(seller.id))!.goodwill - sellerGoodwillBefore).toBe(30);
    // transfer PAYMENT/DONE su PG
    expect(await prisma.transfer.count()).toBe(1);
    const xfer = (await store.listTransfers())[0]!;
    expect(xfer.mode).toBe("PAYMENT");
    expect(xfer.status).toBe("DONE");
    expect(xfer.royaltyTinftCents).toBe(15);

    // -------- validazione (varco esplicito) → USED
    const gate = await ticketing.createValidator(event.id, org.id);
    expect(gate.code).toMatch(/^VARCO-\d{4}$/);
    const val = await ticketing.validate(ticketId, gate.id);
    expect(val.outcome).toBe("VALID");
    expect((await store.getTicket(ticketId))?.status).toBe("USED");
    expect(await prisma.validation.count()).toBe(1);

    // -------- console: dashboard + incassi
    const dash = await consoleSvc.dashboard(org.id);
    expect(dash.ticketsSold).toBe(1);
    expect(dash.grossCents).toBe(3_150); // sold(1) × price
    expect(dash.eventsOnSale).toBe(1);
    expect(dash.validated).toBe(1);
    expect(dash.royaltyOrganizerCents).toBe(16); // dal transfer DONE

    const inc = await consoleSvc.incassi(org.id);
    expect(inc.grossCents).toBe(3_150);
    expect(inc.royaltyOrganizerCents).toBe(16);
    expect(inc.netCents).toBe(3_150 + 16);

    // -------- console: revenue di piattaforma (ledger di processo)
    const rev = await consoleSvc.platformRevenue();
    expect(rev.presaleCommissionCents).toBe(315);
    expect(rev.royaltyTinftCents).toBe(15);
    expect(rev.gmvPrimaryCents).toBe(3_150);
    expect(rev.p2pCount).toBe(1);

    // -------- contenuti editoriali (seed idempotente su PG)
    await store.seedContent();
    await store.seedContent(); // secondo giro: nessun duplicato
    const artists = await content.listArtists();
    expect(artists.length).toBe(4);
    expect(await prisma.artist.count()).toBe(4);
    const blog = await content.listBlog();
    expect(blog).toHaveLength(3);
    const followed = await content.followArtist(artists[0]!.id);
    expect(followed.followers).toBe(artists[0]!.followers + 1);
    expect((await store.getArtist(artists[0]!.id))?.followers).toBe(artists[0]!.followers + 1);
    const news = await content.listNews();
    expect(news.length).toBeGreaterThanOrEqual(3);
  });

  it("payment, pending registration, webhook e ledger vivono su PG (sopravvivono a una nuova istanza)", async () => {
    const clock = {t: 2000};
    const ticketing = new TicketingService(store, () => clock.t);
    const payments = new PaymentsService(store, ticketing, new FakeProvider(), new FakeChain(), () => clock.t);

    // -------- organizzatore + evento ON_SALE + compratore
    const org = await ticketing.createAccount({role: "ORGANIZER", nome: "Org", cognome: "Two", email: "org2@pg.io"});
    org.kycStatus = "VERIFIED";
    await store.updateAccount(org);
    const event = await ticketing.createEvent({
      organizerId: org.id, title: "Notte Pay", venue: "Hangar", date: "22 GIU",
      priceCents: 5_000, capacity: 50, status: "ON_SALE"
    });
    const buyer = await ticketing.createAccount({nome: "Gio", cognome: "P", email: "paybuyer@pg.io", cfHash: "0xpgpaybuyer"});

    // -------- pagamento primario: checkout (PENDING) → persistito su PG
    const {payment, session} = await payments.createPrimaryCheckout(event.id, buyer.id);
    expect(payment.status).toBe("PENDING");
    expect(await prisma.payment.count()).toBe(1);
    // lookup per providerRef passa dal DB (indice unique)
    expect((await store.paymentByProviderRef(session.providerRef))?.id).toBe(payment.id);

    // -------- webhook pagato → mint biglietto, Payment PAID, ProcessedWebhook segnato
    const webhookId = "evt_pg_paid_1";
    const res = await payments.handleWebhook({id: webhookId, type: "payment_succeeded", providerRef: session.providerRef});
    expect(res.handled).toBe(true);
    expect(res.ticketId).toBeDefined();
    expect(await store.hasProcessedWebhook(webhookId)).toBe(true);
    expect(await prisma.processedWebhook.count()).toBeGreaterThanOrEqual(1);
    // webhook idempotente: secondo passaggio è deduped (dal DB, non dalla memoria)
    const again = await payments.handleWebhook({id: webhookId, type: "payment_succeeded", providerRef: session.providerRef});
    expect(again.deduped).toBe(true);

    // -------- registrazione email in attesa → persistita su PG con tutti i campi
    const reg = await ticketing.startEmailRegistration({
      nome: "Anna", cognome: "Verdi", cf: "VRDNNA90A01H501Z", email: "pending@pg.io",
      dateOfBirth: "1990-01-01", city: "Roma", phone: "+390000000", username: "annav", password: "s3cret!"
    });
    expect(await prisma.pendingRegistration.count()).toBe(1);

    // -------- ledger: accredito esplicito con increment atomico
    const before = await store.getLedger();
    const afterAdd = await store.addToLedger({royaltyTinftCents: 7, exitFeeCents: 11});
    expect(afterAdd.royaltyTinftCents).toBe(before.royaltyTinftCents + 7);
    expect(afterAdd.exitFeeCents).toBe(before.exitFeeCents + 11);
    expect(await prisma.platformLedger.count()).toBe(1);

    // -------- PROVA DI PERSISTENZA: nuova istanza PrismaStore (nessuno stato in memoria)
    const fresh = new PrismaStore(prisma);

    // payment ancora presente e PAID
    const freshPayment = await fresh.getPayment(payment.id);
    expect(freshPayment?.status).toBe("PAID");
    expect(freshPayment?.amountCents).toBe(5_000);
    expect(freshPayment?.ticketMintedId).toBe(res.ticketId);
    expect((await fresh.paymentByProviderRef(session.providerRef))?.id).toBe(payment.id);

    // webhook ancora marcato come processato
    expect(await fresh.hasProcessedWebhook(webhookId)).toBe(true);

    // pending registration ancora presente con i campi salvati
    const freshPending = await fresh.getPendingRegistration("pending@pg.io");
    expect(freshPending?.code).toBe(reg.devCode);
    expect(freshPending?.nome).toBe("Anna");
    expect(freshPending?.cf).toBe("VRDNNA90A01H501Z");
    expect(freshPending?.username).toBe("annav");
    expect(freshPending?.passwordHash).toBeDefined();

    // ledger totali ancora presenti (stessi valori dell'ultimo addToLedger)
    const freshLedger = await fresh.getLedger();
    expect(freshLedger).toEqual(afterAdd);

    // -------- conferma a livello di righe DB
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.pendingRegistration.count()).toBe(1);
    expect(await prisma.platformLedger.count()).toBe(1);
    expect((await prisma.processedWebhook.count())).toBeGreaterThanOrEqual(1);
  });

  it("settleOrder CONCORRENTE su PG: il lock di riga (FOR UPDATE) accredita una sola volta", async () => {
    const ticketing = new TicketingService(store);
    const org = await ticketing.createAccount({role: "ORGANIZER", nome: "O3", cognome: "X", email: "org3@pg.io"});
    org.kycStatus = "VERIFIED";
    await store.updateAccount(org);
    const event = await ticketing.createEvent({
      organizerId: org.id, title: "Race", venue: "V", date: "D", priceCents: 1_000, capacity: 10, status: "ON_SALE"
    });
    const buyer = await ticketing.createAccount({nome: "R", cognome: "R", email: "race@pg.io", cfHash: "0xpgrace"});
    const order = await ticketing.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 1});
    expect(order.feeTotalCents).toBe(100); // prevendita 10% di 1000

    const ledgerBefore = (await store.getLedger()).presaleCommissionCents;
    const goodwillBefore = (await store.getAccount(buyer.id))!.goodwill;

    // due settle in parallelo sullo stesso ordine (bypassa il mutex di processo):
    // FOR UPDATE serializza le due transazioni; la seconda trova PAID → no-op.
    const args = {
      orderId: order.id, ticketIds: [] as string[],
      presaleCommissionCents: order.feeTotalCents, buyerId: buyer.id, goodwillDelta: GOODWILL_PER_TICKET
    };
    const [a, b] = await Promise.all([store.settleOrder(args), store.settleOrder(args)]);
    expect(a.status).toBe("PAID");
    expect(b.status).toBe("PAID");
    // accredito ESATTAMENTE una volta nonostante le due chiamate concorrenti
    expect((await store.getLedger()).presaleCommissionCents).toBe(ledgerBefore + 100);
    expect((await store.getAccount(buyer.id))!.goodwill).toBe(goodwillBefore + GOODWILL_PER_TICKET);
    expect((await ticketing.getOrder(order.id)).status).toBe("PAID");
  });
});
