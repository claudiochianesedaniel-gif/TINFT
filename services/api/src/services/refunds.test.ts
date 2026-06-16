import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {GOODWILL_PER_TICKET} from "../domain/rules";

const PRICE = 3_150; // €31,50

async function setup(start = 1000) {
  const store = new MemoryStore();
  const clock = {t: start};
  const service = new TicketingService(store, () => clock.t);
  const org = await service.createAccount({role: "ORGANIZER", nome: "Org", cognome: "Anizer", email: "org@tinft.io"});
  const event = await service.createEvent({organizerId: org.id, title: "Vol.4", venue: "Magazzino", date: "21 GIU", priceCents: PRICE, capacity: 100});
  return {store, service, clock, org, event};
}

function client(service: TicketingService, name: string, cf?: string) {
  return service.createAccount({nome: name, cognome: "Test", email: `${name}@e.it`, cfHash: cf});
}

describe("Rimborsi (refund) + revoca biglietti", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("refundOrder su ordine PAID: revoca i biglietti, storna commissione e goodwill, marca refundedAt", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.payOrder((await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2})).id);
    expect(order.status).toBe("PAID");
    // pre-condizioni: commissione e goodwill accreditati
    expect(s.store.ledger.presaleCommissionCents).toBe(630); // 315 × 2
    expect(s.store.accounts.get(buyer.id)!.goodwill).toBe(GOODWILL_PER_TICKET * 2);

    const refunded = await s.service.refundOrder(order.id);
    expect(refunded.refundedAt).toBe(s.clock.t);
    // biglietti revocati
    for (const id of order.ticketIds) {
      expect(s.store.tickets.get(id)!.revoked).toBe(true);
    }
    // storni: ledger e goodwill tornano a 0
    expect(s.store.ledger.presaleCommissionCents).toBe(0);
    expect(s.store.accounts.get(buyer.id)!.goodwill).toBe(0);
  });

  it("refundOrder è idempotente: un secondo rimborso non storna due volte", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.payOrder((await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 2})).id);
    const first = await s.service.refundOrder(order.id);
    const second = await s.service.refundOrder(order.id);
    expect(second.refundedAt).toBe(first.refundedAt);
    // nessuno storno doppio: resta a 0, non negativo
    expect(s.store.ledger.presaleCommissionCents).toBe(0);
    expect(s.store.accounts.get(buyer.id)!.goodwill).toBe(0);
  });

  it("un biglietto revocato → validate ritorna FAKE (non entra)", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.payOrder((await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1})).id);
    const ticketId = order.ticketIds[0]!;
    await s.service.refundOrder(order.id);
    const val = await s.service.validate(ticketId);
    expect(val.outcome).toBe("FAKE");
    // il biglietto NON è stato segnato USED
    expect(s.store.tickets.get(ticketId)!.status).not.toBe("USED");
  });

  it("un biglietto revocato → listTicket lancia /revocat/i", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.payOrder((await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1})).id);
    const ticketId = order.ticketIds[0]!;
    await s.service.refundOrder(order.id);
    await expect(s.service.listTicket(ticketId, buyer.id, 3_000)).rejects.toThrowError(/revocat/i);
  });

  it("refundOrder su ordine non pagato lancia /pagat/i", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1});
    expect(order.status).toBe("PENDING");
    await expect(s.service.refundOrder(order.id)).rejects.toThrowError(/pagat/i);
  });
});

describe("Annullamento ordine (cancel)", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("cancelOrder: PENDING → CANCELLED; secondo annullo idempotente", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1});
    const cancelled = await s.service.cancelOrder(order.id);
    expect(cancelled.status).toBe("CANCELLED");
    const again = await s.service.cancelOrder(order.id);
    expect(again.status).toBe("CANCELLED");
  });

  it("cancelOrder su ordine PAID lancia (usa il rimborso)", async () => {
    const buyer = await client(s.service, "marco", "idMarco");
    const order = await s.service.payOrder((await s.service.createOrder({buyerId: buyer.id, eventId: s.event.id, quantity: 1})).id);
    expect(order.status).toBe("PAID");
    await expect(s.service.cancelOrder(order.id)).rejects.toThrowError(/pagat/i);
  });
});

describe("Tracciamento payout venditore", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("dopo una vendita sul secondario: pendingSellerPayouts elenca l'incasso, settle lo liquida", async () => {
    const seller = await client(s.service, "sara", "idSara");
    const buyer = await client(s.service, "luca", "idLuca");
    const t = (await s.service.payOrder((await s.service.createOrder({buyerId: seller.id, eventId: s.event.id, quantity: 1})).id)).ticketIds[0]!;
    await s.service.listTicket(t, seller.id, 3_000);
    await s.service.buyFromMarket(t, buyer.id);

    const pending = await s.service.pendingSellerPayouts();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.amountCents).toBe(3_000); // ask price
    expect(pending[0]!.sellerId).toBe(seller.id);
    expect(pending[0]!.ticketId).toBe(t);
    const transferId = pending[0]!.transferId;

    // filtro per venditore
    expect(await s.service.pendingSellerPayouts(seller.id)).toHaveLength(1);
    expect(await s.service.pendingSellerPayouts(buyer.id)).toHaveLength(0);

    const settled = await s.service.settleSellerPayout(transferId);
    expect(settled.payoutSettled).toBe(true);
    // liquidato → non più in attesa
    expect(await s.service.pendingSellerPayouts()).toHaveLength(0);
    // idempotente
    const again = await s.service.settleSellerPayout(transferId);
    expect(again.payoutSettled).toBe(true);
    expect(await s.service.pendingSellerPayouts()).toHaveLength(0);
  });
});
