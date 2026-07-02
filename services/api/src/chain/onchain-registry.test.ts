import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "../services/ticketing";
import type {ChainPort, MintParams, MintResult} from "./port";

/**
 * FASE 4 — registro eventi on-chain: ogni evento riceve UNA volta un eventId
 * on-chain sequenziale univoco, persistito su Event.onchainEventId e passato al
 * mint (chiave del limite anti-bagarino per-evento su TinftTicket). Sostituisce
 * l'hash placeholder che poteva collidere tra eventi.
 */
class SpyChain implements ChainPort {
  private tokenSeq = 0;
  minted: MintParams[] = [];
  async mintTicket(p: MintParams): Promise<MintResult> {
    this.minted.push(p);
    return {tokenId: ++this.tokenSeq, txHash: "0x" + String(this.tokenSeq).padStart(64, "0")};
  }
}

function setup() {
  const store = new MemoryStore();
  const chain = new SpyChain();
  const service = new TicketingService(store, undefined, undefined, chain);
  return {store, chain, service};
}

async function makeEvent(service: TicketingService, title: string) {
  const org = await service.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: `${title}@e.it`});
  return service.createEvent({organizerId: org.id, title, venue: "V", date: "D", priceCents: 1000, capacity: 10});
}

describe("registro eventi on-chain (ensureOnchainEventId)", () => {
  it("assegna id sequenziali univoci per evento, stabili tra mint successivi, e li persiste", async () => {
    const {store, chain, service} = setup();
    const e1 = await makeEvent(service, "primo");
    const e2 = await makeEvent(service, "secondo");
    const buyer = await service.createAccount({nome: "B", cognome: "Y", email: "b@e.it"});
    const buyer2 = await service.createAccount({nome: "C", cognome: "Z", email: "c@e.it"});

    await service.purchasePrimary(e1.id, buyer.id);
    await service.purchasePrimary(e2.id, buyer.id);
    await service.purchasePrimary(e1.id, buyer2.id); // secondo mint sullo stesso evento

    const ids = chain.minted.map((m) => m.onchainEventId);
    expect(ids).toEqual([1, 2, 1]); // univoci per evento, stabili nel tempo

    // persistito sull'evento (sopravvive a riavvii con store persistente)
    expect((await store.getEvent(e1.id))?.onchainEventId).toBe(1);
    expect((await store.getEvent(e2.id))?.onchainEventId).toBe(2);
  });

  it("richieste CONCORRENTI sullo stesso evento → stesso id (nessun doppione dal lock)", async () => {
    const {service} = setup();
    const e = await makeEvent(service, "conc");
    const results = await Promise.all([1, 2, 3, 4].map(() => service.ensureOnchainEventId(e.id)));
    expect(new Set(results).size).toBe(1);
  });

  it("eventi DIVERSI in concorrenza → id tutti distinti", async () => {
    const {service} = setup();
    const events = await Promise.all(["a", "b", "c"].map((t) => makeEvent(service, t)));
    const ids = await Promise.all(events.map((e) => service.ensureOnchainEventId(e.id)));
    expect(new Set(ids).size).toBe(3);
  });
});
