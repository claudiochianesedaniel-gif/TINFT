import {NotFound} from "../domain/models";
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

  /** Ingestione webhook: verifica/normalizza e processa in modo idempotente. */
  async ingestWebhook(rawBody: string, signature?: string): Promise<WebhookResult> {
    const event = this.provider.parseWebhook(rawBody, signature);
    if (!event) return {handled: false};
    return this.handleWebhook(event);
  }

  async handleWebhook(event: PspEvent): Promise<WebhookResult> {
    // idempotenza: stesso evento PSP già processato → no-op
    if (await this.store.hasProcessedWebhook(event.id)) return {handled: false, deduped: true};
    await this.store.markProcessedWebhook(event.id);

    const payment = await this.store.paymentByProviderRef(event.providerRef);
    if (!payment) return {handled: false};

    if (event.type === "payment_failed") {
      if (payment.status === "PENDING") {
        payment.status = "FAILED";
        await this.store.updatePayment(payment);
      }
      return {handled: true, paymentId: payment.id};
    }
    // payment_succeeded — già pagato (difesa anti doppio mint da eventi distinti)
    if (payment.status === "PAID") {
      return {handled: true, paymentId: payment.id, ticketId: payment.ticketMintedId};
    }
    payment.status = "PAID";

    let ticketId: string | undefined;
    if (payment.kind === "PRIMARY" && payment.eventId) {
      const buyer = await this.store.getAccount(payment.accountId);
      // mint on-chain (TinftTicket.mint) → tokenId + txHash, poi registra il biglietto
      const mint = await this.chain.mintTicket({
        to: buyer?.walletAddress,
        reference: payment.eventId,
        priceCents: payment.amountCents
      });
      const ticket = await this.ticketing.purchasePrimary(payment.eventId, payment.accountId, {
        tokenId: mint.tokenId,
        txHash: mint.txHash
      });
      payment.ticketMintedId = ticket.id;
      ticketId = ticket.id;
    }
    await this.store.updatePayment(payment);
    return {handled: true, paymentId: payment.id, ticketId};
  }
}
