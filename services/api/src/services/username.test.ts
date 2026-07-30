import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {isValidUsername, normalizeUsername, usernameFromEmail, isValidPosterDataUrl} from "../domain/rules";

/**
 * Username pubblico (@handle): è l'ETICHETTA con cui un utente viene cercato,
 * riceve biglietti in regalo ed è verificato a mano al varco. Deve essere
 * univoco (niente omonimi) e obbligatorio per i clienti.
 */
const svc = () => new TicketingService(new MemoryStore());
const cliente = (s: TicketingService, n: string, u?: string) =>
  s.createAccount({role: "CLIENTE", nome: n, cognome: "T", email: `${n.toLowerCase()}@e.it`, username: u});

describe("username — regole di formato", () => {
  it("normalizza: trim, minuscole, senza @ iniziale", () => {
    expect(normalizeUsername("  @Marco  ")).toBe("marco");
  });

  it("accetta 3-20 tra minuscole, cifre, punto e underscore; rifiuta il resto", () => {
    expect(isValidUsername("marco.b_90")).toBe(true);
    expect(isValidUsername("ab")).toBe(false); // troppo corto
    expect(isValidUsername("a".repeat(21))).toBe(false); // troppo lungo
    expect(isValidUsername("Marco Rossi")).toBe(false); // spazi
    expect(isValidUsername("marco!")).toBe(false); // simboli
  });

  it("deriva un handle dall'email per gli account storici", () => {
    expect(usernameFromEmail("Mario.Rossi@tinft.io")).toBe("mario.rossi");
  });
});

describe("username — unicità e assegnazione", () => {
  it("il cliente riceve un username: quello scelto, o derivato dall'email", async () => {
    const s = svc();
    expect((await cliente(s, "Marco", "marco")).username).toBe("marco");
    expect((await cliente(s, "Giulia")).username).toBe("giulia"); // da giulia@e.it
  });

  it("rifiuta un username già in uso (niente omonimi)", async () => {
    const s = svc();
    await cliente(s, "Marco", "fan01");
    await expect(cliente(s, "Luca", "fan01")).rejects.toThrow(/in uso/i);
  });

  it("rifiuta un formato non valido scelto dall'utente", async () => {
    await expect(cliente(svc(), "Marco", "no valid!")).rejects.toThrow(/username/i);
  });

  it("la derivazione automatica evita la collisione con un suffisso", async () => {
    const s = svc();
    await s.createAccount({role: "CLIENTE", nome: "A", cognome: "T", email: "marco@a.it"});
    const b = await s.createAccount({role: "CLIENTE", nome: "B", cognome: "T", email: "marco@b.it"});
    expect(b.username).toBe("marco2");
  });

  it("l'organizzatore può non avere username (opzionale)", async () => {
    const org = await svc().createAccount({role: "ORGANIZER", nome: "Club", cognome: "X", email: "org@e.it"});
    expect(org.username).toBeUndefined();
  });

  it("disponibilità e ricerca pubblica per @username", async () => {
    const s = svc();
    await cliente(s, "Marco", "marco");
    expect(await s.isUsernameAvailable("marco")).toMatchObject({available: false, valid: true});
    expect(await s.isUsernameAvailable("nuovo.utente")).toMatchObject({available: true, valid: true});
    expect(await s.findByUsername("@MARCO")).toMatchObject({username: "marco", nome: "Marco"});
    await expect(s.findByUsername("ignoto")).rejects.toThrow(/nessun utente/i);
  });

  it("si può cambiare il proprio username, ma non prendere quello di un altro", async () => {
    const s = svc();
    const a = await cliente(s, "Marco", "marco");
    await cliente(s, "Giulia", "giulia");
    expect((await s.setUsername(a.id, "marco.b")).username).toBe("marco.b");
    await expect(s.setUsername(a.id, "giulia")).rejects.toThrow(/in uso/i);
  });
});

describe("locandina evento — data URL con limite", () => {
  it("accetta un'immagine data URL e rifiuta formati o dimensioni non valide", () => {
    expect(isValidPosterDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isValidPosterDataUrl("https://esempio.it/poster.png")).toBe(false);
    expect(isValidPosterDataUrl(`data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`)).toBe(false);
  });

  it("l'evento conserva la locandina caricata; una non valida viene rifiutata", async () => {
    const s = svc();
    const org = await s.createAccount({role: "ORGANIZER", nome: "O", cognome: "X", email: "o@e.it"});
    const base = {organizerId: org.id, title: "Serata", venue: "Club", date: "01 GEN", priceCents: 1000, capacity: 10};
    const ev = await s.createEvent({...base, posterDataUrl: "data:image/png;base64,iVBORw0KGgo="});
    expect(ev.posterDataUrl).toMatch(/^data:image\/png/);
    await expect(s.createEvent({...base, posterDataUrl: "http://x.it/a.png"})).rejects.toThrow(/locandina/i);
  });
});
