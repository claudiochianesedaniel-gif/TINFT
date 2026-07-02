import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "../services/ticketing";
import {PaymentsService} from "./service";
import {FakeChain} from "../chain/fake";
import {FakeProvider} from "./provider";
import type {CheckoutIntent, CheckoutSession, PspEvent} from "./types";

/**
 * FASE 3 — Stripe Connect (marketplace): account connesso per organizzatore
 * creato all'onboarding del club (una volta, riusato tra i suoi club), blocco
 * pubblicazione senza onboarding, checkout ordini con application fee + destinazione,
 * webhook account.updated che sblocca/blocca.
 */
describe("Stripe Connect — onboarding club + split al checkout", () => {
  let store: MemoryStore;
  let provider: FakeProvider;
  let ticketing: TicketingService;
  let payments: PaymentsService;
  /** intent catturati dal provider (per verificare lo split). */
  let intents: CheckoutIntent[];

  beforeEach(() => {
    store = new MemoryStore();
    intents = [];
    provider = new (class extends FakeProvider {
      override async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
        intents.push(intent);
        return super.createCheckout(intent);
      }
    })();
    ticketing = new TicketingService(store, undefined, undefined, undefined, undefined, provider.connect);
    payments = new PaymentsService(store, ticketing, provider, new FakeChain());
  });

  const billing = {
    ragioneSociale: "Club Astra S.r.l.",
    piva: "IT01234567890",
    iban: "IT60X0542811101000000123456"
  };

  async function organizer() {
    return ticketing.createAccount({role: "ORGANIZER", nome: "Org", cognome: "X", email: `org_${Math.random()}@e.it`});
  }

  it("createClub crea l'account connesso (fake: subito operativo) e lo riusa per il secondo club", async () => {
    const org = await organizer();
    const c1 = await ticketing.createClub({organizerId: org.id, name: "Astra", ...billing});
    expect(c1.stripeAccountId).toBe(`acct_fake_${c1.id}`);
    expect(c1.stripeOnboarded).toBe(true);

    // secondo club dello STESSO organizzatore: stesso account (collegato una volta sola)
    const c2 = await ticketing.createClub({organizerId: org.id, name: "Magazzino", ...billing});
    expect(c2.stripeAccountId).toBe(c1.stripeAccountId);

    // organizzatore diverso → account diverso
    const org2 = await organizer();
    const c3 = await ticketing.createClub({organizerId: org2.id, name: "Altro", ...billing});
    expect(c3.stripeAccountId).not.toBe(c1.stripeAccountId);
  });

  it("club NON onboarded: evento in vendita bloccato (create ON_SALE e publish), DRAFT permesso", async () => {
    const org = await organizer();
    const club = await ticketing.createClub({organizerId: org.id, name: "Astra", ...billing});
    club.stripeOnboarded = false; // come con Stripe reale prima dell'onboarding
    await store.updateClub(club);

    const base = {organizerId: org.id, clubId: club.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10};
    await expect(ticketing.createEvent(base)).rejects.toThrowError(/onboarding Stripe/);

    // la bozza si può creare; è la MESSA IN VENDITA a essere bloccata
    const draft = await ticketing.createEvent({...base, status: "DRAFT"});
    org.kycStatus = "VERIFIED";
    await store.updateAccount(org);
    await expect(ticketing.publishEvent(draft.id, org.id)).rejects.toThrowError(/onboarding Stripe/);

    // webhook account.updated con charges_enabled → sblocca
    const res = await payments.handleWebhook({
      id: "evt_acct_1",
      type: "account_updated",
      providerRef: club.stripeAccountId as string,
      chargesEnabled: true
    } satisfies PspEvent);
    expect(res.handled).toBe(true);
    const published = await ticketing.publishEvent(draft.id, org.id);
    expect(published.status).toBe("ON_SALE");
  });

  it("checkout ordine: intent con application fee = prevendita e destination = account del club", async () => {
    const org = await organizer();
    const club = await ticketing.createClub({organizerId: org.id, name: "Astra", ...billing});
    const event = await ticketing.createEvent({
      organizerId: org.id, clubId: club.id, title: "E", venue: "V", date: "D", priceCents: 3000, capacity: 10
    });
    const buyer = await ticketing.createAccount({nome: "B", cognome: "Y", email: "buyer@e.it"});
    const order = await ticketing.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 2});

    await payments.createOrderCheckout(order.id);
    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    expect(intent.amountCents).toBe(order.totalCents); // (3000+300)×2
    expect(intent.destinationAccountId).toBe(club.stripeAccountId);
    expect(intent.applicationFeeCents).toBe(order.feeTotalCents); // 300×2: la prevendita resta a TINFT
  });

  it("checkout ordine di un evento SENZA club: nessuno split (percorso legacy)", async () => {
    const org = await organizer();
    const event = await ticketing.createEvent({organizerId: org.id, title: "E", venue: "V", date: "D", priceCents: 1000, capacity: 10});
    const buyer = await ticketing.createAccount({nome: "B", cognome: "Y", email: "buyer2@e.it"});
    const order = await ticketing.createOrder({buyerId: buyer.id, eventId: event.id, quantity: 1});

    await payments.createOrderCheckout(order.id);
    expect(intents[0]!.destinationAccountId).toBeUndefined();
    expect(intents[0]!.applicationFeeCents).toBeUndefined();
  });

  it("account.updated con charges_enabled=false RIBLOCCA tutti i club con quell'account; idempotente per evento", async () => {
    const org = await organizer();
    const c1 = await ticketing.createClub({organizerId: org.id, name: "Astra", ...billing});
    const c2 = await ticketing.createClub({organizerId: org.id, name: "Magazzino", ...billing});

    const off: PspEvent = {id: "evt_off", type: "account_updated", providerRef: c1.stripeAccountId as string, chargesEnabled: false};
    expect((await payments.handleWebhook(off)).handled).toBe(true);
    expect((await store.getClub(c1.id))?.stripeOnboarded).toBe(false);
    expect((await store.getClub(c2.id))?.stripeOnboarded).toBe(false);

    // stesso evento PSP consegnato due volte → dedup
    expect((await payments.handleWebhook(off)).deduped).toBe(true);

    // account sconosciuto → non gestito
    const unknown = await payments.handleWebhook({id: "evt_x", type: "account_updated", providerRef: "acct_nope", chargesEnabled: true});
    expect(unknown.handled).toBe(false);
  });

  it("club SENZA account (dati pre-Connect): l'account viene creato lazy al link/refresh", async () => {
    const org = await organizer();
    const club = await ticketing.createClub({organizerId: org.id, name: "Astra", ...billing});
    // simula un club migrato da uno snapshot precedente a Connect
    club.stripeAccountId = undefined;
    club.stripeOnboarded = undefined;
    await store.updateClub(club);

    const link = await payments.stripeOnboardingLink(club.id);
    const after = await store.getClub(club.id);
    expect(after?.stripeAccountId).toBeTruthy();
    expect(link.url).toContain(after?.stripeAccountId as string);
  });

  it("onboarding link + refresh: url dal provider e stato aggiornato sul club", async () => {
    const org = await organizer();
    const club = await ticketing.createClub({organizerId: org.id, name: "Astra", ...billing});
    club.stripeOnboarded = false;
    await store.updateClub(club);

    const link = await payments.stripeOnboardingLink(club.id);
    expect(link.url).toContain(club.stripeAccountId);

    // refresh: il FakeConnect risponde chargesEnabled=true → il club si sblocca
    const refreshed = await payments.refreshClubStripe(club.id);
    expect(refreshed.stripeOnboarded).toBe(true);
    expect((await store.getClub(club.id))?.stripeOnboarded).toBe(true);
  });
});
