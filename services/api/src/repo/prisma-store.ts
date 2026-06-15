import {randomUUID} from "node:crypto";
import {PrismaClient} from "@prisma/client";
import {
  type Account,
  type Artist,
  type BlogPost,
  type Club,
  DomainError,
  type Event,
  type Ledger,
  type News,
  type Order,
  type PendingRegistration,
  type Ticket,
  type Tier,
  type Transfer,
  type Validation,
  type Validator
} from "../domain/models";
import type {Payment} from "../payments/types";
import type {Store} from "./store";

/**
 * Adapter PostgreSQL ({@link Store}) basato su PrismaClient. Si attiva quando
 * `DATABASE_URL` è impostata (vedi index.ts); il MemoryStore resta il default del
 * prototipo. Mappa gli oggetti di dominio (src/domain/models.ts, importi in
 * centesimi, tokenId number) ↔ righe Prisma.
 *
 * Riconciliazioni rispetto allo schema:
 *  - `Account` ↔ `Account`; per soddisfare le FK di `Event`/`Club` su `Organizer`
 *    si garantisce (lazy) una riga `Organizer` con lo STESSO id dell'account
 *    (organizerId di dominio = account id).
 *  - `Ticket.tokenId` BigInt ↔ number; l'appartenenza all'ordine viaggia sulla
 *    relazione `Ticket.orderId` (ricostruita in `getOrder` come `ticketIds`).
 *  - Payment, registrazioni email (OTP), dedup webhook e ledger di piattaforma
 *    sono persistiti su Postgres (tabelle Payment/PendingRegistration/
 *    ProcessedWebhook/PlatformLedger). Il ledger è una riga singola (id="platform")
 *    creata lazy; gli accrediti usano increment atomici (UPDATE x = x + delta).
 *    L'intero flusso (ordine→pay→biglietti, mercato, royalty, validazione,
 *    pagamenti, console, contenuti) è quindi interamente persistito su Postgres.
 */
export class PrismaStore implements Store {
  private readonly prisma: PrismaClient;

  /** Id della riga singola del ledger di piattaforma. */
  private static readonly LEDGER_ID = "platform";

  private readonly ensuredOrganizers = new Set<string>();

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  /** Chiude la connessione (per shutdown/test). */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // -------- generatori di id --------------------------------------------------
  id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, "")}`;
  }

  async nextTokenId(): Promise<number> {
    const agg = await this.prisma.ticket.aggregate({_max: {tokenId: true}});
    const max = agg._max.tokenId;
    return (max == null ? 0 : Number(max)) + 1;
  }

  // -------- mappers -----------------------------------------------------------
  private toAccount(r: PrismaAccount): Account {
    return {
      id: r.id,
      role: r.role,
      nome: r.nome,
      cognome: r.cognome,
      email: r.email,
      kycStatus: r.kycStatus ?? undefined,
      cf: r.cf ?? undefined,
      cfHash: r.cfHash ?? undefined,
      dateOfBirth: r.dateOfBirth ?? undefined,
      placeOfBirth: r.placeOfBirth ?? undefined,
      gender: r.gender ?? undefined,
      address: r.address ?? undefined,
      city: r.city ?? undefined,
      zip: r.zip ?? undefined,
      province: r.province ?? undefined,
      phone: r.phone ?? undefined,
      verified: r.verified,
      walletAddress: r.walletAddress ?? undefined,
      goodwill: r.goodwill,
      passwordHash: r.passwordHash ?? undefined
    };
  }

  private accountData(a: Account) {
    return {
      role: a.role,
      kycStatus: a.kycStatus ?? null,
      nome: a.nome,
      cognome: a.cognome,
      email: a.email,
      cf: a.cf ?? null,
      cfHash: a.cfHash ?? null,
      dateOfBirth: a.dateOfBirth ?? null,
      placeOfBirth: a.placeOfBirth ?? null,
      gender: a.gender ?? null,
      address: a.address ?? null,
      city: a.city ?? null,
      zip: a.zip ?? null,
      province: a.province ?? null,
      phone: a.phone ?? null,
      verified: a.verified,
      walletAddress: a.walletAddress ?? null,
      goodwill: a.goodwill,
      passwordHash: a.passwordHash ?? null
    };
  }

  private toClub(r: PrismaClub): Club {
    return {
      id: r.id,
      organizerId: r.organizerId,
      name: r.name,
      city: r.city,
      fidelityPriceCents: r.fidelityPriceCents,
      fidelityUses: r.fidelityUses,
      ragioneSociale: r.ragioneSociale ?? undefined,
      piva: r.piva ?? undefined,
      sedeLegale: r.sedeLegale ?? undefined,
      pec: r.pec ?? undefined,
      sdi: r.sdi ?? undefined,
      iban: r.iban ?? undefined,
      genre: r.genre ?? undefined,
      color: r.color ?? undefined
    };
  }

  private toEvent(r: PrismaEvent): Event {
    return {
      id: r.id,
      organizerId: r.organizerId,
      clubId: r.clubId ?? undefined,
      title: r.title,
      venue: r.venue,
      date: r.date,
      type: r.type,
      priceCents: r.priceCents,
      capacity: r.capacity,
      sold: r.sold,
      status: r.status
    };
  }

  private toTier(r: PrismaTier): Tier {
    return {
      id: r.id,
      eventId: r.eventId,
      name: r.name,
      priceCents: r.priceCents,
      note: r.note ?? undefined,
      soldOut: r.soldOut
    };
  }

  private toTicket(r: PrismaTicket): Ticket {
    return {
      id: r.id,
      eventId: r.eventId,
      ownerId: r.ownerId,
      tokenId: Number(r.tokenId),
      originalPriceCents: r.originalPriceCents,
      paidCents: r.paidCents,
      status: r.status,
      exportMode: r.exportMode,
      exitFeeCents: r.exitFeeCents,
      holderName: r.holderName,
      txHash: r.txHash ?? undefined,
      kind: r.kind,
      clubId: r.clubId ?? undefined,
      uses: r.uses ?? undefined,
      used: r.used ?? undefined,
      askPriceCents: r.askPriceCents ?? undefined,
      market: r.market ?? undefined
    };
  }

  private toTransfer(r: PrismaTransfer): Transfer {
    return {
      id: r.id,
      ticketId: r.ticketId,
      fromId: r.fromId,
      toId: r.toId ?? undefined,
      mode: r.mode,
      priceCents: r.priceCents,
      royaltyCents: r.royaltyCents,
      royaltyTinftCents: r.royaltyTinftCents,
      royaltyOrganizerCents: r.royaltyOrganizerCents,
      status: r.status,
      ttlSeconds: r.ttlSeconds,
      createdAt: Math.floor(r.createdAt.getTime() / 1000)
    };
  }

  /** Garantisce una riga Organizer con id = account id (FK di Event/Club). */
  private async ensureOrganizer(accountId: string): Promise<void> {
    if (this.ensuredOrganizers.has(accountId)) return;
    const account = await this.prisma.account.findUnique({where: {id: accountId}});
    if (!account) throw new DomainError("NOT_FOUND", "account non trovato", 404);
    await this.prisma.organizer.upsert({
      where: {id: accountId},
      update: {},
      create: {
        id: accountId,
        accountId,
        name: `${account.nome} ${account.cognome}`.trim() || account.email,
        piva: `ORG-${accountId}`
      }
    });
    this.ensuredOrganizers.add(accountId);
  }

  // -------- account -----------------------------------------------------------
  async getAccount(id: string): Promise<Account | undefined> {
    const r = await this.prisma.account.findUnique({where: {id}});
    return r ? this.toAccount(r) : undefined;
  }

  async getAccountByEmail(email: string): Promise<Account | undefined> {
    const target = email.trim().toLowerCase();
    const r = await this.prisma.account.findFirst({
      where: {email: {equals: target, mode: "insensitive"}}
    });
    return r ? this.toAccount(r) : undefined;
  }

  async listAccounts(): Promise<Account[]> {
    return (await this.prisma.account.findMany()).map((r) => this.toAccount(r));
  }

  async createAccount(account: Account): Promise<Account> {
    await this.prisma.account.create({data: {id: account.id, ...this.accountData(account)}});
    if (account.role === "ORGANIZER") await this.ensureOrganizer(account.id);
    return account;
  }

  async updateAccount(account: Account): Promise<Account> {
    await this.prisma.account.update({where: {id: account.id}, data: this.accountData(account)});
    if (account.role === "ORGANIZER") await this.ensureOrganizer(account.id);
    return account;
  }

  async deleteAccount(id: string): Promise<void> {
    // rimuove dipendenze che bloccherebbero la cancellazione (best-effort, GDPR)
    await this.prisma.organizer.deleteMany({where: {accountId: id}});
    await this.prisma.account.delete({where: {id}});
  }

  // -------- club --------------------------------------------------------------
  async getClub(id: string): Promise<Club | undefined> {
    const r = await this.prisma.club.findUnique({where: {id}});
    return r ? this.toClub(r) : undefined;
  }

  async listClubs(): Promise<Club[]> {
    return (await this.prisma.club.findMany()).map((r) => this.toClub(r));
  }

  async createClub(club: Club): Promise<Club> {
    await this.ensureOrganizer(club.organizerId);
    await this.prisma.club.create({
      data: {
        id: club.id,
        organizerId: club.organizerId,
        name: club.name,
        city: club.city,
        fidelityPriceCents: club.fidelityPriceCents,
        fidelityUses: club.fidelityUses,
        ragioneSociale: club.ragioneSociale ?? null,
        piva: club.piva ?? null,
        sedeLegale: club.sedeLegale ?? null,
        pec: club.pec ?? null,
        sdi: club.sdi ?? null,
        iban: club.iban ?? null,
        genre: club.genre ?? null,
        color: club.color ?? null
      }
    });
    return club;
  }

  async updateClub(club: Club): Promise<Club> {
    await this.prisma.club.update({
      where: {id: club.id},
      data: {
        name: club.name,
        city: club.city,
        fidelityPriceCents: club.fidelityPriceCents,
        fidelityUses: club.fidelityUses,
        ragioneSociale: club.ragioneSociale ?? null,
        piva: club.piva ?? null,
        sedeLegale: club.sedeLegale ?? null,
        pec: club.pec ?? null,
        sdi: club.sdi ?? null,
        iban: club.iban ?? null,
        genre: club.genre ?? null,
        color: club.color ?? null
      }
    });
    return club;
  }

  // -------- eventi ------------------------------------------------------------
  async getEvent(id: string): Promise<Event | undefined> {
    const r = await this.prisma.event.findUnique({where: {id}});
    return r ? this.toEvent(r) : undefined;
  }

  async listEvents(): Promise<Event[]> {
    return (await this.prisma.event.findMany()).map((r) => this.toEvent(r));
  }

  async eventsByOrganizer(organizerId: string): Promise<Event[]> {
    return (await this.prisma.event.findMany({where: {organizerId}})).map((r) => this.toEvent(r));
  }

  async eventsByClub(clubId: string): Promise<Event[]> {
    return (await this.prisma.event.findMany({where: {clubId}})).map((r) => this.toEvent(r));
  }

  async createEvent(event: Event): Promise<Event> {
    await this.ensureOrganizer(event.organizerId);
    await this.prisma.event.create({
      data: {
        id: event.id,
        organizerId: event.organizerId,
        clubId: event.clubId ?? null,
        title: event.title,
        venue: event.venue,
        date: event.date,
        type: event.type,
        priceCents: event.priceCents,
        capacity: event.capacity,
        sold: event.sold,
        status: event.status
      }
    });
    return event;
  }

  async updateEvent(event: Event): Promise<Event> {
    await this.prisma.event.update({
      where: {id: event.id},
      data: {
        clubId: event.clubId ?? null,
        title: event.title,
        venue: event.venue,
        date: event.date,
        type: event.type,
        priceCents: event.priceCents,
        capacity: event.capacity,
        sold: event.sold,
        status: event.status
      }
    });
    return event;
  }

  // -------- tier --------------------------------------------------------------
  async getTier(id: string): Promise<Tier | undefined> {
    const r = await this.prisma.tier.findUnique({where: {id}});
    return r ? this.toTier(r) : undefined;
  }

  async tiersByEvent(eventId: string): Promise<Tier[]> {
    return (await this.prisma.tier.findMany({where: {eventId}})).map((r) => this.toTier(r));
  }

  async createTier(tier: Tier): Promise<Tier> {
    await this.prisma.tier.create({
      data: {
        id: tier.id,
        eventId: tier.eventId,
        name: tier.name,
        priceCents: tier.priceCents,
        note: tier.note ?? null,
        soldOut: tier.soldOut
      }
    });
    return tier;
  }

  async updateTier(tier: Tier): Promise<Tier> {
    await this.prisma.tier.update({
      where: {id: tier.id},
      data: {name: tier.name, priceCents: tier.priceCents, note: tier.note ?? null, soldOut: tier.soldOut}
    });
    return tier;
  }

  // -------- ordini ------------------------------------------------------------
  private async fillTicketIds(order: Order): Promise<Order> {
    const tickets = await this.prisma.ticket.findMany({where: {orderId: order.id}, select: {id: true}});
    order.ticketIds = tickets.map((t) => t.id);
    return order;
  }

  private toOrder(r: PrismaOrder): Order {
    return {
      id: r.id,
      buyerId: r.buyerId,
      eventId: r.eventId,
      tierId: r.tierId ?? undefined,
      quantity: r.quantity,
      unitPriceCents: r.unitPriceCents,
      presaleCommissionCents: r.presaleCommissionCents,
      feeTotalCents: r.feeTotalCents,
      subtotalCents: r.subtotalCents,
      totalCents: r.totalCents,
      status: r.status,
      ticketIds: [],
      createdAt: Math.floor(r.createdAt.getTime() / 1000)
    };
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const r = await this.prisma.order.findUnique({where: {id}});
    if (!r) return undefined;
    return this.fillTicketIds(this.toOrder(r));
  }

  async ordersByBuyer(buyerId: string): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({where: {buyerId}});
    return Promise.all(rows.map((r) => this.fillTicketIds(this.toOrder(r))));
  }

  async createOrder(order: Order): Promise<Order> {
    await this.prisma.order.create({
      data: {
        id: order.id,
        buyerId: order.buyerId,
        eventId: order.eventId,
        tierId: order.tierId ?? null,
        quantity: order.quantity,
        unitPriceCents: order.unitPriceCents,
        presaleCommissionCents: order.presaleCommissionCents,
        feeTotalCents: order.feeTotalCents,
        subtotalCents: order.subtotalCents,
        totalCents: order.totalCents,
        status: order.status
      }
    });
    return order;
  }

  async updateOrder(order: Order): Promise<Order> {
    await this.prisma.order.update({
      where: {id: order.id},
      data: {tierId: order.tierId ?? null, quantity: order.quantity, status: order.status}
    });
    // l'appartenenza dei biglietti all'ordine viaggia su Ticket.orderId
    if (order.ticketIds.length > 0) {
      await this.prisma.ticket.updateMany({
        where: {id: {in: order.ticketIds}},
        data: {orderId: order.id}
      });
    }
    return order;
  }

  async settleOrder(input: {
    orderId: string;
    ticketIds: string[];
    presaleCommissionCents: number;
    buyerId: string;
    goodwillDelta: number;
  }): Promise<Order> {
    await this.getLedger(); // garantisce la riga del ledger PRIMA della transazione
    return this.prisma.$transaction(async (tx) => {
      // Lock di riga sull'ordine: serializza consegne concorrenti dello stesso ordine
      // (la 2ª transazione attende il commit della 1ª e poi vede già PAID → no-op).
      const locked = await tx.$queryRaw<Array<{status: string}>>`
        SELECT "status" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`;
      const row = locked[0];
      if (!row) throw new DomainError("ORDER_NOT_FOUND", "ordine inesistente", 404);
      if (row.status === "PAID") {
        const cur = await tx.order.findUniqueOrThrow({where: {id: input.orderId}});
        return {...this.toOrder(cur), ticketIds: input.ticketIds}; // idempotente
      }
      // tutto-o-niente: biglietti + ledger + goodwill + stato nello stesso commit
      if (input.ticketIds.length > 0) {
        await tx.ticket.updateMany({where: {id: {in: input.ticketIds}}, data: {orderId: input.orderId}});
      }
      await tx.platformLedger.update({
        where: {id: PrismaStore.LEDGER_ID},
        data: {presaleCommissionCents: {increment: input.presaleCommissionCents}}
      });
      await tx.account.update({where: {id: input.buyerId}, data: {goodwill: {increment: input.goodwillDelta}}});
      const updated = await tx.order.update({where: {id: input.orderId}, data: {status: "PAID"}});
      return {...this.toOrder(updated), ticketIds: input.ticketIds};
    });
  }

  // -------- biglietti ---------------------------------------------------------
  private ticketData(t: Ticket) {
    return {
      eventId: t.eventId,
      ownerId: t.ownerId,
      tokenId: BigInt(t.tokenId),
      kind: t.kind ?? "EVENT",
      clubId: t.clubId ?? null,
      originalPriceCents: t.originalPriceCents,
      paidCents: t.paidCents,
      status: t.status,
      exportMode: t.exportMode,
      exitFeeCents: t.exitFeeCents,
      askPriceCents: t.askPriceCents ?? null,
      market: t.market ?? null,
      uses: t.uses ?? null,
      used: t.used ?? null,
      holderName: t.holderName,
      txHash: t.txHash ?? null
    };
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const r = await this.prisma.ticket.findUnique({where: {id}});
    return r ? this.toTicket(r) : undefined;
  }

  async ticketsByOwner(ownerId: string): Promise<Ticket[]> {
    return (await this.prisma.ticket.findMany({where: {ownerId}})).map((r) => this.toTicket(r));
  }

  async listedTickets(): Promise<Ticket[]> {
    return (await this.prisma.ticket.findMany({where: {status: "LISTED"}})).map((r) => this.toTicket(r));
  }

  async heldCountForIdentity(eventId: string, cfHash: string): Promise<number> {
    const owners = await this.prisma.account.findMany({where: {cfHash}, select: {id: true}});
    if (owners.length === 0) return 0;
    return this.prisma.ticket.count({
      where: {
        eventId,
        ownerId: {in: owners.map((o) => o.id)},
        status: {in: ["ACTIVE", "LISTED"]}
      }
    });
  }

  async heldForEventByBuyer(eventId: string, buyerId: string): Promise<number> {
    const tickets = await this.prisma.ticket.count({
      where: {eventId, ownerId: buyerId, status: {in: ["ACTIVE", "LISTED"]}}
    });
    const incoming = await this.prisma.transfer.count({
      where: {toId: buyerId, status: {in: ["PENDING", "ESCROW"]}, ticket: {eventId}}
    });
    return tickets + incoming;
  }

  async createTicket(ticket: Ticket): Promise<Ticket> {
    if (!ticket.eventId) {
      // Lo schema richiede una FK valida verso Event; i carnet Fidelity (eventId="")
      // non sono coperti dalla persistenza Postgres nello schema corrente.
      throw new DomainError("UNSUPPORTED", "Fidelity non supportato dallo store Postgres", 501);
    }
    await this.prisma.ticket.create({data: {id: ticket.id, ...this.ticketData(ticket)}});
    return ticket;
  }

  async updateTicket(ticket: Ticket): Promise<Ticket> {
    await this.prisma.ticket.update({where: {id: ticket.id}, data: this.ticketData(ticket)});
    return ticket;
  }

  async deleteTicket(id: string): Promise<void> {
    await this.prisma.validation.deleteMany({where: {ticketId: id}});
    await this.prisma.transfer.deleteMany({where: {ticketId: id}});
    await this.prisma.ticket.delete({where: {id}});
  }

  // -------- trasferimenti -----------------------------------------------------
  private transferData(x: Transfer) {
    return {
      ticketId: x.ticketId,
      fromId: x.fromId,
      toId: x.toId ?? null,
      mode: x.mode,
      priceCents: x.priceCents,
      royaltyCents: x.royaltyCents,
      royaltyTinftCents: x.royaltyTinftCents,
      royaltyOrganizerCents: x.royaltyOrganizerCents,
      status: x.status,
      ttlSeconds: x.ttlSeconds
    };
  }

  async getTransfer(id: string): Promise<Transfer | undefined> {
    const r = await this.prisma.transfer.findUnique({where: {id}});
    return r ? this.toTransfer(r) : undefined;
  }

  async listTransfers(): Promise<Transfer[]> {
    return (await this.prisma.transfer.findMany()).map((r) => this.toTransfer(r));
  }

  async activeTransferForTicket(ticketId: string): Promise<Transfer | undefined> {
    const r = await this.prisma.transfer.findFirst({
      where: {ticketId, status: {in: ["PENDING", "ESCROW"]}}
    });
    return r ? this.toTransfer(r) : undefined;
  }

  async createTransfer(transfer: Transfer): Promise<Transfer> {
    await this.prisma.transfer.create({data: {id: transfer.id, ...this.transferData(transfer)}});
    return transfer;
  }

  async updateTransfer(transfer: Transfer): Promise<Transfer> {
    await this.prisma.transfer.update({
      where: {id: transfer.id},
      data: {toId: transfer.toId ?? null, status: transfer.status, priceCents: transfer.priceCents}
    });
    return transfer;
  }

  // -------- validazioni / varchi ----------------------------------------------
  private toValidation(r: PrismaValidation): Validation {
    return {
      id: r.id,
      ticketId: r.ticketId,
      validatorId: r.validatorId ?? undefined,
      outcome: r.outcome,
      at: Math.floor(r.at.getTime() / 1000)
    };
  }

  async listValidations(): Promise<Validation[]> {
    return (await this.prisma.validation.findMany()).map((r) => this.toValidation(r));
  }

  async validationsByEvent(eventId: string): Promise<Validation[]> {
    return (await this.prisma.validation.findMany({where: {ticket: {eventId}}})).map((r) =>
      this.toValidation(r)
    );
  }

  /** Varco di sistema per validazioni senza gate esplicito (FK richiesta). */
  private async systemValidatorFor(eventId: string): Promise<string> {
    const code = `SYS-${eventId}`;
    const existing = await this.prisma.validator.findUnique({where: {code}});
    if (existing) return existing.id;
    const id = this.id("gate");
    await this.prisma.validator.create({data: {id, eventId, code}});
    return id;
  }

  async createValidation(validation: Validation): Promise<Validation> {
    const ticket = await this.prisma.ticket.findUnique({where: {id: validation.ticketId}});
    // FAKE su ticket inesistente: niente FK soddisfacibile → restituisce senza persistere.
    if (!ticket) return validation;
    let validatorId = validation.validatorId;
    if (!validatorId) validatorId = await this.systemValidatorFor(ticket.eventId);
    await this.prisma.validation.create({
      data: {id: validation.id, ticketId: validation.ticketId, validatorId, outcome: validation.outcome}
    });
    return {...validation, validatorId};
  }

  async validatorsByEvent(eventId: string): Promise<Validator[]> {
    const rows = await this.prisma.validator.findMany({where: {eventId, NOT: {code: {startsWith: "SYS-"}}}});
    return rows.map((r) => ({id: r.id, eventId: r.eventId, code: r.code, createdAt: Math.floor(r.createdAt.getTime() / 1000)}));
  }

  async createValidator(validator: Validator): Promise<Validator> {
    await this.prisma.validator.create({
      data: {id: validator.id, eventId: validator.eventId, code: validator.code}
    });
    return validator;
  }

  // -------- pagamenti ---------------------------------------------------------
  private toPayment(r: PrismaPayment): Payment {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      amountCents: r.amountCents,
      currency: r.currency,
      accountId: r.accountId,
      eventId: r.eventId ?? undefined,
      ticketId: r.ticketId ?? undefined,
      providerRef: r.providerRef,
      ticketMintedId: r.ticketMintedId ?? undefined,
      createdAt: Math.floor(r.createdAt.getTime() / 1000)
    };
  }

  private paymentData(p: Payment) {
    return {
      kind: p.kind,
      status: p.status,
      amountCents: p.amountCents,
      currency: p.currency,
      accountId: p.accountId,
      eventId: p.eventId ?? null,
      ticketId: p.ticketId ?? null,
      providerRef: p.providerRef,
      ticketMintedId: p.ticketMintedId ?? null
    };
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const r = await this.prisma.payment.findUnique({where: {id}});
    return r ? this.toPayment(r) : undefined;
  }

  async paymentByProviderRef(ref: string): Promise<Payment | undefined> {
    const r = await this.prisma.payment.findUnique({where: {providerRef: ref}});
    return r ? this.toPayment(r) : undefined;
  }

  async createPayment(payment: Payment): Promise<Payment> {
    await this.prisma.payment.create({data: {id: payment.id, ...this.paymentData(payment)}});
    return payment;
  }

  async updatePayment(payment: Payment): Promise<Payment> {
    await this.prisma.payment.update({where: {id: payment.id}, data: this.paymentData(payment)});
    return payment;
  }

  // -------- registrazioni email (OTP) -----------------------------------------
  private toPending(r: PrismaPending): PendingRegistration {
    return {
      email: r.email,
      code: r.code,
      nome: r.nome,
      cognome: r.cognome,
      cf: r.cf,
      dateOfBirth: r.dateOfBirth ?? undefined,
      placeOfBirth: r.placeOfBirth ?? undefined,
      gender: r.gender ?? undefined,
      address: r.address ?? undefined,
      city: r.city ?? undefined,
      zip: r.zip ?? undefined,
      province: r.province ?? undefined,
      phone: r.phone ?? undefined,
      username: r.username ?? undefined,
      passwordHash: r.passwordHash ?? undefined,
      createdAt: Math.floor(r.createdAt.getTime() / 1000)
    };
  }

  private pendingData(p: PendingRegistration) {
    return {
      code: p.code,
      nome: p.nome,
      cognome: p.cognome,
      cf: p.cf,
      dateOfBirth: p.dateOfBirth ?? null,
      placeOfBirth: p.placeOfBirth ?? null,
      gender: p.gender ?? null,
      address: p.address ?? null,
      city: p.city ?? null,
      zip: p.zip ?? null,
      province: p.province ?? null,
      phone: p.phone ?? null,
      username: p.username ?? null,
      passwordHash: p.passwordHash ?? null
    };
  }

  async getPendingRegistration(email: string): Promise<PendingRegistration | undefined> {
    const r = await this.prisma.pendingRegistration.findUnique({where: {email}});
    return r ? this.toPending(r) : undefined;
  }

  async setPendingRegistration(pending: PendingRegistration): Promise<PendingRegistration> {
    await this.prisma.pendingRegistration.upsert({
      where: {email: pending.email},
      update: this.pendingData(pending),
      create: {email: pending.email, ...this.pendingData(pending)}
    });
    return pending;
  }

  async deletePendingRegistration(email: string): Promise<void> {
    await this.prisma.pendingRegistration.deleteMany({where: {email}});
  }

  // -------- idempotenza webhook -----------------------------------------------
  async hasProcessedWebhook(id: string): Promise<boolean> {
    return (await this.prisma.processedWebhook.count({where: {id}})) > 0;
  }

  async markProcessedWebhook(id: string): Promise<void> {
    await this.prisma.processedWebhook.upsert({where: {id}, update: {}, create: {id}});
  }

  // -------- ledger di piattaforma ---------------------------------------------
  /** Legge la riga singola del ledger, creandola lazy se assente. */
  async getLedger(): Promise<Ledger> {
    const r = await this.prisma.platformLedger.upsert({
      where: {id: PrismaStore.LEDGER_ID},
      update: {},
      create: {id: PrismaStore.LEDGER_ID}
    });
    return {
      presaleCommissionCents: r.presaleCommissionCents,
      royaltyTinftCents: r.royaltyTinftCents,
      royaltyOrganizerCents: r.royaltyOrganizerCents,
      exitFeeCents: r.exitFeeCents
    };
  }

  async addToLedger(delta: Partial<Ledger>): Promise<Ledger> {
    await this.getLedger(); // garantisce l'esistenza della riga
    const r = await this.prisma.platformLedger.update({
      where: {id: PrismaStore.LEDGER_ID},
      data: {
        // increment atomico: UPDATE … SET x = x + delta
        presaleCommissionCents: {increment: delta.presaleCommissionCents ?? 0},
        royaltyTinftCents: {increment: delta.royaltyTinftCents ?? 0},
        royaltyOrganizerCents: {increment: delta.royaltyOrganizerCents ?? 0},
        exitFeeCents: {increment: delta.exitFeeCents ?? 0}
      }
    });
    return {
      presaleCommissionCents: r.presaleCommissionCents,
      royaltyTinftCents: r.royaltyTinftCents,
      royaltyOrganizerCents: r.royaltyOrganizerCents,
      exitFeeCents: r.exitFeeCents
    };
  }

  // -------- contenuti editoriali ---------------------------------------------
  async listArtists(): Promise<Artist[]> {
    return this.prisma.artist.findMany();
  }

  async getArtist(id: string): Promise<Artist | undefined> {
    const r = await this.prisma.artist.findUnique({where: {id}});
    return r ?? undefined;
  }

  async updateArtist(artist: Artist): Promise<Artist> {
    await this.prisma.artist.update({where: {id: artist.id}, data: {followers: artist.followers}});
    return artist;
  }

  async listBlogPosts(): Promise<BlogPost[]> {
    return this.prisma.blogPost.findMany();
  }

  async blogBySlug(slug: string): Promise<BlogPost | undefined> {
    const r = await this.prisma.blogPost.findUnique({where: {slug}});
    return r ?? undefined;
  }

  async listNews(): Promise<News[]> {
    return this.prisma.news.findMany();
  }

  async seedContent(): Promise<void> {
    const [artists, posts, news] = await Promise.all([
      this.prisma.artist.count(),
      this.prisma.blogPost.count(),
      this.prisma.news.count()
    ]);
    if (artists === 0) {
      const palette = ["#2f4f8a", "#0a8a5c", "#9c5e00", "#7a3550"];
      await this.prisma.artist.createMany({
        data: [
          {id: this.id("art"), name: "Charlotte de Witte", genre: "Techno", initials: "CW", color: palette[0]!, followers: 12840},
          {id: this.id("art"), name: "Adam Beyer", genre: "Techno", initials: "AB", color: palette[1]!, followers: 9760},
          {id: this.id("art"), name: "Mind Against", genre: "Melodic", initials: "MA", color: palette[2]!, followers: 6420},
          {id: this.id("art"), name: "Blue Room Quartet", genre: "Jazz", initials: "BR", color: palette[3]!, followers: 2150}
        ]
      });
    }
    if (posts === 0) {
      await this.prisma.blogPost.createMany({
        data: [
          {
            id: this.id("post"),
            slug: "guida-acquisto-biglietti-nft",
            tag: "GUIDA",
            title: "Come acquistare un biglietto NFT su TINFT",
            excerpt: "Dalla registrazione SPID al wallet: il percorso completo per il tuo primo biglietto.",
            readMins: 5
          },
          {
            id: this.id("post"),
            slug: "dietro-le-quinte-mint-on-chain",
            tag: "DIETRO LE QUINTE",
            title: "Dietro le quinte: come funziona il mint on-chain",
            excerpt: "Cosa succede quando paghi: escrow, mint del token e ledger di piattaforma.",
            readMins: 7
          },
          {
            id: this.id("post"),
            slug: "mercato-secondario-tetto-prezzo",
            tag: "MERCATO",
            title: "Mercato secondario: il tetto +5% e la royalty",
            excerpt: "Rivendere senza secondary selvaggio: regole, royalty 1% e protezione del fan.",
            readMins: 4
          }
        ]
      });
    }
    if (news === 0) {
      await this.prisma.news.createMany({
        data: [
          {id: this.id("news"), date: "2026-05-02", title: "TINFT apre le vendite per la stagione estiva"},
          {id: this.id("news"), date: "2026-05-18", title: "Nuovi club partner a Milano e Bologna"},
          {id: this.id("news"), date: "2026-06-01", title: "Aggiornamento: export libero con fee d'uscita 25%"},
          {id: this.id("news"), date: "2026-06-10", title: "Charlotte de Witte annuncia una data esclusiva"}
        ]
      });
    }
  }
}

// -------- tipi delle righe Prisma (derivati dai metodi del client) ------------
type Unwrap<T> = T extends Promise<infer U> ? U : T;
type NonNull<T> = Exclude<T, null>;
type PrismaAccount = NonNull<Unwrap<ReturnType<PrismaClient["account"]["findUnique"]>>>;
type PrismaClub = NonNull<Unwrap<ReturnType<PrismaClient["club"]["findUnique"]>>>;
type PrismaEvent = NonNull<Unwrap<ReturnType<PrismaClient["event"]["findUnique"]>>>;
type PrismaTier = NonNull<Unwrap<ReturnType<PrismaClient["tier"]["findUnique"]>>>;
type PrismaTicket = NonNull<Unwrap<ReturnType<PrismaClient["ticket"]["findUnique"]>>>;
type PrismaOrder = NonNull<Unwrap<ReturnType<PrismaClient["order"]["findUnique"]>>>;
type PrismaTransfer = NonNull<Unwrap<ReturnType<PrismaClient["transfer"]["findUnique"]>>>;
type PrismaValidation = NonNull<Unwrap<ReturnType<PrismaClient["validation"]["findUnique"]>>>;
type PrismaPayment = NonNull<Unwrap<ReturnType<PrismaClient["payment"]["findUnique"]>>>;
type PrismaPending = NonNull<Unwrap<ReturnType<PrismaClient["pendingRegistration"]["findUnique"]>>>;
