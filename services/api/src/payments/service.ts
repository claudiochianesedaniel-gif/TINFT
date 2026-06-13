import {NotFound} from "../domain/models";
import {MemoryStore} from "../repo/memory";
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
    private readonly store: MemoryStore,
    private readonly ticketing: TicketingService,
    private readonly provider: PaymentProvider,
    private readonly chain: ChainPort,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000)
  ) {}

  async createPrimaryCheckout(
    eventId: string,
    buyerId: string
  ): Promise<{payment: Payment; session: {providerRef: string; url: string}}> {
    const event = this.ticketing.getEvent(eventId);
    if (!this.store.accounts.get(buyerId)) throw NotFound("account");

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
    this.store.payments.set(payment.id, payment);
    return {payment, session};
  }

  /** Ingestione webhook: verifica/normalizza e processa in modo idempotente. */
  async ingestWebhook(rawBody: string, signature?: string): Promise<WebhookResult> {
    const event = this.provider.parseWebhook(rawBody, signature);
    if (!event) return {handled: false};
    return this.handleWebhook(event);
  }

  async handleWebhook(event: PspEvent): Promise<WebhookResult> {
    // idempotenza: stesso evento PSP già processato → no-op
    if (this.store.processedWebhooks.has(event.id)) return {handled: false, deduped: true};
    this.store.processedWebhooks.add(event.id);

    const payment = this.store.paymentByProviderRef(event.providerRef);
    if (!payment) return {handled: false};

    if (event.type === "payment_failed") {
      if (payment.status === "PENDING") payment.status = "FAILED";
      return {handled: true, paymentId: payment.id};
    }
    // payment_succeeded — già pagato (difesa anti doppio mint da eventi distinti)
    if (payment.status === "PAID") {
      return {handled: true, paymentId: payment.id, ticketId: payment.ticketMintedId};
    }
    payment.status = "PAID";

    let ticketId: string | undefined;
    if (payment.kind === "PRIMARY" && payment.eventId) {
      const buyer = this.store.accounts.get(payment.accountId);
      // mint on-chain (TinftTicket.mint) → tokenId + txHash, poi registra il biglietto
      const mint = await this.chain.mintTicket({
        to: buyer?.walletAddress,
        reference: payment.eventId,
        priceCents: payment.amountCents
      });
      const ticket = this.ticketing.purchasePrimary(payment.eventId, payment.accountId, {
        tokenId: mint.tokenId,
        txHash: mint.txHash
      });
      payment.ticketMintedId = ticket.id;
      ticketId = ticket.id;
    }
    return {handled: true, paymentId: payment.id, ticketId};
  }
}
