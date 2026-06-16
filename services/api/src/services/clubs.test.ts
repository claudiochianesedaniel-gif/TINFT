import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";

async function setup() {
  const store = new MemoryStore();
  const s = new TicketingService(store);
  const org = await s.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: "o@e.it"});
  return {store, s, org};
}

// dati di fatturazione validi (obbligatori alla creazione club)
const BILLING = {ragioneSociale: "Astra S.r.l.", piva: "01234567890", iban: "IT60X0542811101000000123456"};

describe("Club & Fidelity", () => {
  it("crea club ed eventi del club, li elenca", async () => {
    const {s, org} = await setup();
    const c = await s.createClub({organizerId: org.id, name: "Club Astra", city: "Milano", fidelityPriceCents: 12000, fidelityUses: 5, ...BILLING});
    expect(await s.listClubs()).toHaveLength(1);
    const e1 = await s.createEvent({organizerId: org.id, clubId: c.id, title: "Vol.4", venue: "V", date: "21 GIU", priceCents: 3150, capacity: 500});
    await s.createEvent({organizerId: org.id, clubId: c.id, title: "Jazz", venue: "A", date: "03 LUG", priceCents: 2400, capacity: 200});
    expect(await s.clubEvents(c.id)).toHaveLength(2);
    expect(e1.clubId).toBe(c.id);
  });

  it("Fidelity del club: carnet multi-ingresso consumato dalla validazione", async () => {
    const {s, store, org} = await setup();
    const c = await s.createClub({organizerId: org.id, name: "Astra", fidelityPriceCents: 12000, fidelityUses: 3, ...BILLING});
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
    const c = await s.createClub({organizerId: org.id, name: "NoFid", ...BILLING});
    const buyer = await s.createAccount({nome: "L", cognome: "R", email: "l@e.it"});
    await expect(s.purchaseFidelity(c.id, buyer.id)).rejects.toThrowError(/Fidelity/);
  });

  it("rifiuta la creazione del club senza dati di fatturazione (P.IVA obbligatoria)", async () => {
    const {s, org} = await setup();
    // manca tutto
    await expect(s.createClub({organizerId: org.id, name: "Senza P.IVA"})).rejects.toThrowError(/fatturazione|P\.IVA/i);
    // P.IVA non a 11 cifre
    await expect(
      s.createClub({organizerId: org.id, name: "P.IVA corta", ragioneSociale: "X S.r.l.", piva: "123", iban: "IT60X..."})
    ).rejects.toThrowError(/fatturazione|P\.IVA/i);
    // manca l'IBAN
    await expect(
      s.createClub({organizerId: org.id, name: "Senza IBAN", ragioneSociale: "X S.r.l.", piva: "01234567890"})
    ).rejects.toThrowError(/fatturazione|IBAN|P\.IVA/i);
    // completo (anche con prefisso IT) → ok
    const ok = await s.createClub({organizerId: org.id, name: "Completo", ...BILLING, piva: "IT01234567890"});
    expect(ok.piva).toBe("IT01234567890");
  });
});
