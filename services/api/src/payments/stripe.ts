import Stripe from "stripe";
import {DomainError} from "../domain/models";
import type {PaymentProvider} from "./provider";
import type {CheckoutIntent, CheckoutSession, PspEvent} from "./types";

/**
 * Adapter Stripe reale. createCheckout crea una sessione di pagamento in euro;
 * parseWebhook verifica la firma e normalizza l'evento. Si attiva via env
 * (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET); altrimenti l'API usa il FakeProvider.
 */
export class StripeProvider implements PaymentProvider {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly urls: {success?: string; cancel?: string} = {}
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
      success_url: this.urls.success ?? "https://tinft.app/checkout/ok",
      cancel_url: this.urls.cancel ?? "https://tinft.app/checkout/ko",
      metadata: {kind: intent.kind, accountId: intent.accountId, eventId: intent.eventId ?? ""}
    });
    return {providerRef: session.id, url: session.url ?? ""};
  }

  parseWebhook(rawBody: string, signature?: string): PspEvent | null {
    if (!signature) throw new DomainError("BAD_WEBHOOK", "firma webhook mancante");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new DomainError("BAD_WEBHOOK", "firma webhook non valida");
    }
    const providerRef = (event.data.object as {id?: string}).id ?? "";
    if (event.type === "checkout.session.completed") {
      return {id: event.id, type: "payment_succeeded", providerRef};
    }
    if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
      return {id: event.id, type: "payment_failed", providerRef};
    }
    return null; // evento non rilevante → ack senza azione
  }
}
