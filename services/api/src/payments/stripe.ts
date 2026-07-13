import Stripe from "stripe";
import {DomainError} from "../domain/models";
import type {ConnectedAccountStatus, ConnectPort, PaymentProvider} from "./provider";
import type {CheckoutIntent, CheckoutSession, PspEvent} from "./types";

/**
 * Adapter Stripe reale. createCheckout crea una sessione di pagamento in euro
 * (con split Connect se l'intent porta un account di destinazione); parseWebhook
 * verifica la firma e normalizza l'evento. Si attiva via env
 * (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET); altrimenti l'API usa il FakeProvider.
 */
export class StripeProvider implements PaymentProvider, ConnectPort {
  private readonly stripe: Stripe;
  /** Capacità Connect: questo stesso adapter (account Express + onboarding link). */
  readonly connect: ConnectPort = this;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly urls: {success?: string; cancel?: string; connectReturn?: string; connectRefresh?: string} = {}
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: intent.currency.toLowerCase(),
            unit_amount: intent.amountCents,
            product_data: {name: `TINFT · ${intent.kind}`}
          }
        }
      ],
      success_url: this.urls.success ?? process.env.CHECKOUT_SUCCESS_URL ?? "http://localhost:8080/checkout/ok",
      cancel_url: this.urls.cancel ?? process.env.CHECKOUT_CANCEL_URL ?? "http://localhost:8080/checkout/ko",
      // metadati portati fino al webhook: orderId è il riferimento che lega la sessione all'ordine v2
      metadata: {kind: intent.kind, accountId: intent.accountId, eventId: intent.eventId ?? "", orderId: intent.orderId ?? ""},
      // anche il PaymentIntent porta i metadati: così payment_intent.succeeded espone l'orderId.
      // Split Connect: l'incasso va all'account dell'organizzatore, TINFT trattiene la fee.
      payment_intent_data: {
        metadata: {orderId: intent.orderId ?? ""},
        ...(intent.destinationAccountId
          ? {
              application_fee_amount: intent.applicationFeeCents ?? 0,
              transfer_data: {destination: intent.destinationAccountId}
            }
          : {})
      }
    });
    return {providerRef: session.id, url: session.url ?? ""};
  }

  // ------------------------------------------------------------ Connect (marketplace)
  async createConnectedAccount(input: {clubId: string; email?: string; name?: string}): Promise<ConnectedAccountStatus> {
    const account = await this.stripe.accounts.create({
      type: "express",
      email: input.email,
      business_profile: input.name ? {name: input.name} : undefined,
      metadata: {clubId: input.clubId}
    });
    return {accountId: account.id, chargesEnabled: !!account.charges_enabled};
  }

  async createOnboardingLink(accountId: string): Promise<{url: string}> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: this.urls.connectReturn ?? process.env.CONNECT_RETURN_URL ?? "http://localhost:8080/connect/ok",
      refresh_url: this.urls.connectRefresh ?? process.env.CONNECT_REFRESH_URL ?? "http://localhost:8080/connect/retry"
    });
    return {url: link.url};
  }

  async getAccountStatus(accountId: string): Promise<ConnectedAccountStatus> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return {accountId, chargesEnabled: !!account.charges_enabled};
  }

  parseWebhook(rawBody: string, signature?: string): PspEvent | null {
    if (!signature) throw new DomainError("BAD_WEBHOOK", "firma webhook mancante");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new DomainError("BAD_WEBHOOK", "firma webhook non valida");
    }
    const object = event.data.object as {id?: string; metadata?: Record<string, string> | null; charges_enabled?: boolean};
    const providerRef = object.id ?? "";
    const orderId = object.metadata?.orderId || undefined;
    if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
      return {id: event.id, type: "payment_succeeded", providerRef, orderId};
    }
    if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
      return {id: event.id, type: "payment_failed", providerRef, orderId};
    }
    // Onboarding Connect: quando l'organizzatore completa l'onboarding Stripe
    // manda account.updated con charges_enabled=true → sblocca la pubblicazione.
    if (event.type === "account.updated") {
      return {id: event.id, type: "account_updated", providerRef, chargesEnabled: !!object.charges_enabled};
    }
    return null; // evento non rilevante → ack senza azione
  }
}
