import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {signAccessToken} from "../access/access-token";

/**
 * I biglietti demo (seed) hanno un tokenId che sul contratto non esiste: markUsed
 * reverte con ERC721NonexistentToken e, prima di questa correzione, la validazione
 * restituiva 500 lasciando la persona fuori dalla porta.
 */
describe("validazione al varco — token non presente on-chain", () => {
  const nonexistent = () => {
    throw new Error(
      'The contract function "markUsed" reverted with the following signature:\n0x7e273289'
    );
  };

  async function setup(markUsed: () => Promise<{txHash: string}>) {
    const store = new MemoryStore();
    const svc = new TicketingService(store, undefined, undefined, {
      mintTicket: async () => ({tokenId: 2, txHash: "0xseed"}),
      markUsed
    });
    const org = await svc.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: "o@t.io", cfHash: "o"});
    const cli = await svc.createAccount({role: "CLIENTE", nome: "C", cognome: "Y", email: "c@t.io", cfHash: "c"});
    const ev = await svc.createEvent({organizerId: org.id, title: "E", venue: "V", date: "1 GEN", priceCents: 1000, capacity: 5});
    const ticket = await svc.purchasePrimary(ev.id, cli.id);
    const token = signAccessToken(ticket.id);
    return {svc, ticket, token};
  }

  it("il token non esiste sul contratto → l'ingresso viene comunque validato e bruciato", async () => {
    const {svc, ticket, token} = await setup(async () => nonexistent());
    const res = await svc.scanValidate(token);
    expect(res.outcome).toBe("VALID");
    expect((await svc.getTicket(ticket.id)).status).toBe("BURNED");
  });

  it("un errore diverso (es. rete) resta bloccante: l'operatore ritenta", async () => {
    const {svc, token} = await setup(async () => {
      throw new Error("RPC timeout");
    });
    await expect(svc.scanValidate(token)).rejects.toThrow(/RPC timeout/);
  });
});
