import type {Store} from "./repo/store";
import type {TicketingService} from "./services/ticketing";
import {hashPassword} from "./auth/password";

/**
 * Seed di un "mondo" demo coerente per il prototipo: organizzatore (KYC verificato),
 * due client, due club con dati societari, eventi in vendita con fasce, qualche vendita
 * e una rivendita sul mercato. Account demo con password unica "demo123" così tutte le
 * superfici (sito, web app, console) condividono lo stesso mondo via login fisso.
 * Idempotente: non riseeda se ci sono già eventi.
 */
export const DEMO_PASSWORD = "demo123";
export const DEMO = {
  organizer: "org@tinft.io",
  client: "cli@tinft.io",
  client2: "cli2@tinft.io"
};

export async function seedDemo(store: Store, ticketing: TicketingService): Promise<{seeded: boolean}> {
  if ((await store.listEvents()).length > 0) return {seeded: false};
  const ph = hashPassword(DEMO_PASSWORD);

  const org = await ticketing.createAccount({role: "ORGANIZER", nome: "Club Astra", cognome: "Eventi", email: DEMO.organizer});
  Object.assign(org, {passwordHash: ph, kycStatus: "VERIFIED"});
  await store.updateAccount(org);
  const cli = await ticketing.createAccount({role: "CLIENTE", nome: "Marco", cognome: "Bianchi", email: DEMO.client, cf: "BNCMRC90A01F205X", cfHash: "0xdemocli"});
  Object.assign(cli, {passwordHash: ph, verified: true});
  await store.updateAccount(cli);
  const cli2 = await ticketing.createAccount({role: "CLIENTE", nome: "Giulia", cognome: "Verdi", email: DEMO.client2, cf: "VRDGLI90A41F205Y", cfHash: "0xdemocli2"});
  Object.assign(cli2, {passwordHash: ph, verified: true});
  await store.updateAccount(cli2);

  const c1 = await ticketing.createClub({
    organizerId: org.id, name: "Club Astra", city: "Milano",
    ragioneSociale: "Club Astra S.r.l.", piva: "IT01234567890", sedeLegale: "Via Roma 1, 20121 Milano (MI)",
    pec: "astra@pec.it", sdi: "ABCDEF1", iban: "IT60X0542811101000000123456", genre: "Techno", color: "#4472c4"
  });
  const c2 = await ticketing.createClub({organizerId: org.id, name: "Magazzino Generali", city: "Milano", genre: "House", color: "#0a8a5c"});

  const e1 = await ticketing.createEvent({organizerId: org.id, clubId: c1.id, title: "Notte Elettronica · Vol.4", venue: "Magazzino Generali", date: "21 GIU", priceCents: 3150, capacity: 500, status: "ON_SALE"});
  const e2 = await ticketing.createEvent({organizerId: org.id, clubId: c1.id, title: "Blue Room · Jazz", venue: "Auditorium", date: "03 LUG", priceCents: 2400, capacity: 200, status: "ON_SALE"});
  const e3 = await ticketing.createEvent({organizerId: org.id, clubId: c2.id, title: "Opening Night", venue: "Magazzino Generali", date: "28 GIU", priceCents: 2800, capacity: 300, status: "ON_SALE"});

  await ticketing.createTier(e1.id, {organizerId: org.id, name: "Intero", priceCents: 3150});
  await ticketing.createTier(e1.id, {organizerId: org.id, name: "Last Release", priceCents: 3800, note: "pochi rimasti"});

  // vendite pregresse simulate (per dashboard/incassi/holder non vuoti)
  e1.sold = 312;
  await store.updateEvent(e1);
  e2.sold = 36;
  await store.updateEvent(e2);
  e3.sold = 120;
  await store.updateEvent(e3);

  // Marco possiede un biglietto reale su e1 (così "I miei biglietti" non è vuoto)
  const ord = await ticketing.createOrder({buyerId: cli.id, eventId: e1.id, quantity: 1});
  await ticketing.payOrder(ord.id);

  // Giulia compra su e2 e lo rivende sul mercato (mercato secondario non vuoto, tetto +10%)
  const ord2 = await ticketing.createOrder({buyerId: cli2.id, eventId: e2.id, quantity: 1});
  const paid2 = await ticketing.payOrder(ord2.id);
  const tId = paid2.ticketIds[0];
  if (tId) await ticketing.listTicket(tId, cli2.id, 2400); // ≤ 2400*1.05

  return {seeded: true};
}
