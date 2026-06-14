import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";

async function setup() {
  const store = new MemoryStore();
  const s = new TicketingService(store);
  const org = await s.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: "o@e.it"});
  return {store, s, org};
}

describe("Club & Fidelity", () => {
  it("crea club ed eventi del club, li elenca", async () => {
    const {s, org} = await setup();
    const c = await s.createClub({organizerId: org.id, name: "Club Astra", city: "Milano", fidelityPriceCents: 12000, fidelityUses: 5});
    expect(await s.listClubs()).toHaveLength(1);
    const e1 = await s.createEvent({organizerId: org.id, clubId: c.id, title: "Vol.4", venue: "V", date: "21 GIU", priceCents: 3150, capacity: 500});
    await s.createEvent({organizerId: org.id, clubId: c.id, title: "Jazz", venue: "A", date: "03 LUG", priceCents: 2400, capacity: 200});
    expect(await s.clubEvents(c.id)).toHaveLength(2);
    expect(e1.clubId).toBe(c.id);
  });

  it("Fidelity del club: carnet multi-ingresso consumato dalla validazione", async () => {
    const {s, store, org} = await setup();
    const c = await s.createClub({organizerId: org.id, name: "Astra", fidelityPriceCents: 12000, fidelityUses: 3});
    const buyer = await s.createAccount({nome: "M", cognome: "B", email: "m@e.it", cfHash: "idM"});
    const fid = await s.purchaseFidelity(c.id, buyer.id);
    expect(fid.kind).toBe("FIDELITY");
    expect(fid.uses).toBe(3);
    await s.validate(fid.id);
    expect(store.tickets.get(fid.id)!.status).toBe("ACTIVE"); // 1/3
    await s.validate(fid.id);
    expect(store.tickets.get(fid.id)!.status).toBe("ACTIVE"); // 2/3
    await s.validate(fid.id);
    expect(store.tickets.get(fid.id)!.status).toBe("USED"); // 3/3 esaurito
    expect(store.tickets.get(fid.id)!.used).toBe(3);
  });

  it("un club senza Fidelity rifiuta l'acquisto del carnet", async () => {
    const {s, org} = await setup();
    const c = await s.createClub({organizerId: org.id, name: "NoFid"});
    const buyer = await s.createAccount({nome: "L", cognome: "R", email: "l@e.it"});
    await expect(s.purchaseFidelity(c.id, buyer.id)).rejects.toThrowError(/Fidelity/);
  });
});
