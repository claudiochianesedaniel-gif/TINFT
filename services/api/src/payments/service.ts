import {DomainError, NotFound} from "../domain/models";
import type {Store} from "../repo/store";
import {TicketingService} from "../services/ticketing";
import type {ChainPort} from "../chain/port";
import type {PaymentProvider} from "./provider";
import type {Payment, PspEvent} from "./types";

export interface WebhookResult {
  handled: boolean;
  deduped?: boolean;
  paymentId?: string;
  ticketId?: string;
}

/**
 * Pagamenti (M7): checkout in euro → al webhook di pagamento riuscito conia il
 * biglietto sul wallet custodial (via TicketingService; il mint on-chain reale è
 * un job successivo). Webhook **idempotente**: lo stesso evento PSP processato
 * due volte concia un solo biglietto.
 */
export class PaymentsService {
  constructor(
    private readonly store: Store,
    private readonly ticketing: TicketingService,
    private readonly provider: PaymentProvider,
    private readonly chain: ChainPort,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000)
  ) {}

  async createPrimaryCheckout(
    eventId: string,
    buyerId: string
  ): Promise<{payment: Payment; session: {providerRef: string; url: string}}> {
    const event = await this.ticketing.getEvent(eventId);
    if (!(await this.store.getAccount(buyerId))) throw NotFound("account");

    const session = await this.provider.createCheckout({
      kind: "PRIMARY",
      amountCents: event.priceCents,
      currency: "EUR",
      accountId: buyerId,
      eventId
    });
    const payment: Payment = {
      id: this.store.id("pay"),
      kind: "PRIMARY",
      status: "PENDING",
      amountCents: event.priceCents,
      currency: "EUR",
      accountId: buyerId,
      eventId,
      providerRef: session.providerRef,
      createdAt: this.now()
    };
    await this.store.createPayment(payment);
    return {payment, session};
  }

  /**
   * Checkout di un ordine v2 (multi-biglietto): apre una sessione PSP per
   * `order.totalCents` portando l'`orderId` nei metadati e registra un Payment
   * PRIMARY PENDING. Al webbook "succeeded" si concretizza via ticketing.payOrder.
   */
  async createOrderCheckout(orderId: string): Promise<{payment: Payment; checkoutUrl: string; providerRef: string}> {
    const order = await this.ticketing.getOrder(orderId);
    if (order.status !== "PENDING") throw new DomainError("ORDER_NOT_PENDING", "ordine non in attesa di pagamento", 409);

    // Split Connect: l'incasso dell'evento va all'account connesso del club
    // dell'organizzatore; TINFT trattiene la commissione di prevendita come
    // application fee. Senza club/account connesso → checkout piatta (legacy).
    const event = await this.ticketing.getEvent(order.eventId);
    const club = event.clubId ? await this.store.getClub(event.clubId) : undefined;
    const split =
      club?.stripeAccountId && club.stripeOnboarded
        ? {destinationAccountId: club.stripeAccountId, applicationFeeCents: order.feeTotalCents}
        : {};

    const session = await this.provider.createCheckout({
      kind: "PRIMARY",
      amountCents: order.totalCents,
      currency: "EUR",
      accountId: order.buyerId,
      eventId: order.eventId,
      orderId: order.id,
      ...split
    });
    const payment: Payment = {
      id: this.store.id("pay"),
      kind: "PRIMARY",
      status: "PENDING",
      amountCents: order.totalCents,
      currency: "EUR",
      accountId: order.buyerId,
      eventId: order.eventId,
      orderId: order.id,
      providerRef: session.providerRef,
      createdAt: this.now()
    };
    await this.store.createPayment(payment);
    return {payment, checkoutUrl: session.url, providerRef: session.providerRef};
  }

  // ------------------------------------------------------------ Stripe Connect
  /** Link di onboarding Stripe per il club (da mostrare all'organizzatore). */
  async stripeOnboardingLink(clubId: string): Promise<{url: string}> {
    const club = await this.ensureClubAccount(clubId);
    return this.requireConnect().createOnboardingLink(club.stripeAccountId as string);
  }

  /**
   * Rilegge lo stato dell'account connesso dal provider e aggiorna il club
   * (per il ritorno dall'onboarding, oltre al webhook account.updated).
   */
  async refreshClubStripe(clubId: string): Promise<{clubId: string; stripeAccountId: string; stripeOnboarded: boolean}> {
    const club = await this.ensureClubAccount(clubId);
    const status = await this.requireConnect().getAccountStatus(club.stripeAccountId as string);
    club.stripeOnboarded = status.chargesEnabled;
    await this.store.updateClub(club);
    return {clubId: club.id, stripeAccountId: club.stripeAccountId as string, stripeOnboarded: club.stripeOnboarded};
  }

  private requireConnect() {
    const connect = this.provider.connect;
    if (!connect) throw new DomainError("CONNECT_UNAVAILABLE", "il provider di pagamento non supporta Connect", 501);
    return connect;
  }

  /**
   * Club con account connesso garantito: i club creati prima di Connect (dati
   * migrati/snapshot) non ne hanno uno — viene creato QUI, lazy, riusando quello
   * di un altro club dello stesso organizzatore se esiste.
   */
  private async ensureClubAccount(clubId: string) {
    const club = await this.store.getClub(clubId);
    if (!club) throw NotFound("club");
    if (club.stripeAccountId) return club;

    const sibling = (await this.store.listClubs()).find((c) => c.organizerId === club.organizerId && c.stripeAccountId);
    if (sibling) {
      club.stripeAccountId = sibling.stripeAccountId;
      club.stripeOnboarded = sibling.stripeOnboarded;
    } else {
      const org = await this.store.getAccount(club.organizerId);
      const acct = await this.requireConnect().createConnectedAccount({
        clubId: club.id,
        email: org?.email,
        name: club.ragioneSociale ?? club.name
      });
      club.stripeAccountId = acct.accountId;
      club.stripeOnboarded = acct.chargesEnabled;
    }
    await this.store.updateClub(club);
    return club;
  }

  /** Ingestione webhook: verifica/normalizza e processa in modo idempotente. */
  async ingestWebhook(rawBody: string, signature?: string): Promise<WebhookResult> {
    const event = this.provider.parseWebhook(rawBody, signature);
    if (!event) return {handled: false};
    return this.handleWebhook(event);
  }

  async handleWebhook(event: PspEvent): Promise<WebhookResult> {
    // idempotenza: stesso evento PSP già processato → no-op
    if (await this.store.hasProcessedWebhook(event.id)) return {handled: false, deduped: true};

    // Processa PRIMA, marca come processato DOPO il successo: se il handling lancia
    // (es. mint on-chain giù) l'evento NON risulta processato e la redelivery del PSP
    // lo RITENTA — invece di essere scartato per dedup lasciando l'ordine pagato
    // bloccato per sempre. I handler sono idempotenti (payOrder riprendibile + guardia
    // pagamento PAID), quindi un ritento dopo un successo parziale non duplica nulla.
    const result = await this.processWebhook(event);
    await this.store.markProcessedWebhook(event.id);
    return result;
  }

  private async processWebhook(event: PspEvent): Promise<WebhookResult> {
    // Onboarding Connect completato/aggiornato: propaga charges_enabled ai club
    // che usano quell'account connesso (sblocca/blocca la pubblicazione eventi).
    if (event.type === "account_updated") {
      const clubs = await this.store.clubsByStripeAccount(event.providerRef);
      if (clubs.length === 0) return {handled: false};
      for (const club of clubs) {
        club.stripeOnboarded = !!event.chargesEnabled;
        await this.store.updateClub(club);
      }
      return {handled: true};
    }

    const payment = await this.store.paymentByProviderRef(event.providerRef);
    if (!payment) return {handled: false};

    // Rimborso/chargeback dal PSP: storna l'ordine collegato (revoca biglietti,
    // ledger e goodwill) tramite ticketing.refundOrder (idempotente).
    if (event.type === "payment_refunded") {
      if (payment.orderId) await this.ticketing.refundOrder(payment.orderId);
      return {handled: true, paymentId: payment.id};
    }

    if (event.type === "payment_failed") {
      if (payment.status === "PENDING") {
        payment.status = "FAILED";
        await this.store.updatePayment(payment);
      }
      // pagamento fallito su un ordine ancora in attesa → annulla l'ordine
      // (cancelOrder è idempotente e lancia solo se PAID, che qui non può essere).
      if (payment.orderId) {
        const order = await this.ticketing.getOrder(payment.orderId);
        if (order.status === "PENDING") await this.ticketing.cancelOrder(payment.orderId);
      }
      return {handled: true, paymentId: payment.id};
    }
    // payment_succeeded — già pagato (difesa anti doppio mint da eventi distinti)
    if (payment.status === "PAID") {
      return {handled: true, paymentId: payment.id, ticketId: payment.ticketMintedId};
    }

    // Checkout di un ordine v2: delega a ticketing.payOrder (idempotente) che concia
    // gli N biglietti, accredita ledger e goodwill; il Payment passa a PAID.
    if (payment.orderId) {
      const order = await this.ticketing.payOrder(payment.orderId);
      payment.status = "PAID";
      payment.ticketMintedId = order.ticketIds[0];
      await this.store.updatePayment(payment);
      return {handled: true, paymentId: payment.id, ticketId: order.ticketIds[0]};
    }

    let ticketId: string | undefined;
    if (payment.kind === "PRIMARY" && payment.eventId) {
      const buyer = await this.store.getAccount(payment.accountId);
      // mint on-chain (TinftTicket.mint) → tokenId + txHash, poi registra il biglietto
      const mint = await this.chain.mintTicket({
        to: buyer?.walletAddress,
        reference: payment.eventId,
        onchainEventId: await this.ticketing.ensureOnchainEventId(payment.eventId), // registro (FASE 4)
        priceCents: payment.amountCents
      });
      const ticket = await this.ticketing.purchasePrimary(payment.eventId, payment.accountId, {
        tokenId: mint.tokenId,
        txHash: mint.txHash
      });
      payment.ticketMintedId = ticket.id;
      ticketId = ticket.id;
    }
    // PAID solo DOPO il mint riuscito: se il mint lancia, il pagamento resta PENDING
    // e la redelivery ritenta (niente pagamento PAID senza biglietto).
    payment.status = "PAID";
    await this.store.updatePayment(payment);
    return {handled: true, paymentId: payment.id, ticketId};
  }
}
