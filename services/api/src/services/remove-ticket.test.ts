import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";

/** Rimozione di un titolo dal wallet: serve a ripulire la lista dai biglietti conclusi. */
describe("removeTicket — archiviazione dal wallet", () => {
  async function setup() {
    const store = new MemoryStore();
    const svc = new TicketingService(store);
    const org = await svc.createAccount({role: "ORGANIZER", nome: "Org", cognome: "X", email: "o@t.io", cfHash: "o"});
    const cli = await svc.createAccount({role: "CLIENTE", nome: "Cli", cognome: "Y", email: "c@t.io", cfHash: "c"});
    const ev = await svc.createEvent({
      organizerId: org.id, title: "E", venue: "V", date: "1 GEN", priceCents: 1000, capacity: 10
    });
    const ticket = await svc.purchasePrimary(ev.id, cli.id);
    return {svc, store, cli, org, ev, ticket};
  }

  it("il proprietario rimuove il titolo e sparisce dai suoi biglietti", async () => {
    const {svc, cli, ticket} = await setup();
    expect(await svc.ticketsOf(cli.id)).toHaveLength(1);
    await svc.removeTicket(ticket.id, cli.id);
    expect(await svc.ticketsOf(cli.id)).toHaveLength(0);
  });

  it("un altro utente non può rimuovere un titolo altrui", async () => {
    const {svc, org, ticket} = await setup();
    await expect(svc.removeTicket(ticket.id, org.id)).rejects.toThrow(/proprietario/i);
  });

  it("un titolo in vendita va prima ritirato (il compratore resterebbe appeso)", async () => {
    const {svc, cli, ticket} = await setup();
    await svc.listTicket(ticket.id, cli.id, 1050);
    await expect(svc.removeTicket(ticket.id, cli.id)).rejects.toThrow(/vendita/i);
  });
});
