import {beforeEach, describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";

/**
 * Regalo/invio di un biglietto e verifica manuale al varco: entrambi passano
 * dall'@username, non dal nome (gli omonimi renderebbero ambiguo il varco).
 */
let store: MemoryStore;
let svc: TicketingService;
let orgId: string;
let eventId: string;
let marcoId: string;
let giuliaId: string;

beforeEach(async () => {
  store = new MemoryStore();
  svc = new TicketingService(store);
  const org = await svc.createAccount({role: "ORGANIZER", nome: "Club", cognome: "X", email: "org@e.it"});
  orgId = org.id;
  const ev = await svc.createEvent({
    organizerId: orgId, title: "Notte", venue: "Club", date: "01 GEN",
    priceCents: 1000, capacity: 50, gateCode: "NOTTE-1A"
  });
  eventId = ev.id;
  marcoId = (await svc.createAccount({role: "CLIENTE", nome: "Marco", cognome: "B", email: "m@e.it", username: "marco"})).id;
  giuliaId = (await svc.createAccount({role: "CLIENTE", nome: "Giulia", cognome: "V", email: "g@e.it", username: "giulia"})).id;
});

describe("regalo di un biglietto per @username", () => {
  it("passa al destinatario indicato con l'handle (anche con la @)", async () => {
    const t = await svc.purchasePrimary(eventId, marcoId);
    const moved = await svc.transferTicketToUsername(t.id, marcoId, "@giulia");
    expect(moved.ownerId).toBe(giuliaId);
    expect(moved.holderName).toBe("Giulia V");
    expect(await svc.ticketsOf(giuliaId)).toHaveLength(1);
    expect(await svc.ticketsOf(marcoId)).toHaveLength(0);
  });

  it("rifiuta se il destinatario non esiste", async () => {
    const t = await svc.purchasePrimary(eventId, marcoId);
    await expect(svc.transferTicketToUsername(t.id, marcoId, "sconosciuto")).rejects.toThrow(/nessun utente/i);
  });

  it("rifiuta se non sei il proprietario o se regali a te stesso", async () => {
    const t = await svc.purchasePrimary(eventId, marcoId);
    await expect(svc.transferTicketToUsername(t.id, giuliaId, "giulia")).rejects.toThrow(/proprietario/i);
    await expect(svc.transferTicketToUsername(t.id, marcoId, "marco")).rejects.toThrow(/te stesso/i);
  });

  it("un biglietto BRUCIATO al varco non è più regalabile", async () => {
    const t = await svc.purchasePrimary(eventId, marcoId);
    await svc.validate(t.id, orgId);
    await expect(svc.transferTicketToUsername(t.id, marcoId, "giulia")).rejects.toThrow(/non trasferibile/i);
  });
});

describe("verifica manuale al varco per @username", () => {
  it("mostra i biglietti dell'utente per quel varco e il loro stato", async () => {
    await svc.purchasePrimary(eventId, marcoId);
    const res = await svc.gateLookupByUsername("NOTTE-1A", "@marco");
    expect(res.user).toMatchObject({username: "marco", nome: "Marco B"});
    expect(res.event.id).toBe(eventId);
    expect(res.tickets).toHaveLength(1);
    expect(res.tickets[0]?.status).toBe("ACTIVE");
  });

  it("dopo l'ingresso il biglietto risulta BURNED (lo staff vede che è già entrato)", async () => {
    const t = await svc.purchasePrimary(eventId, marcoId);
    await svc.validate(t.id, orgId);
    const res = await svc.gateLookupByUsername("NOTTE-1A", "marco");
    expect(res.tickets[0]?.status).toBe("BURNED");
  });

  it("errore chiaro su username inesistente o codice varco sconosciuto", async () => {
    await expect(svc.gateLookupByUsername("NOTTE-1A", "ignoto")).rejects.toThrow(/nessun utente/i);
    await expect(svc.gateLookupByUsername("XXX-000", "marco")).rejects.toThrow();
  });
});
