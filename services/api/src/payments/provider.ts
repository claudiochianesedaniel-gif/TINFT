import {DomainError} from "../domain/models";
import type {CheckoutIntent, CheckoutSession, PspEvent} from "./types";

/**
 * Astrazione del Payment Service Provider (Stripe/Nexi). L'API dipende solo da
 * questa interfaccia; l'adapter reale (firma webhook, SDK) è un innesto successivo.
 */
export interface PaymentProvider {
  createCheckout(intent: CheckoutIntent): CheckoutSession;
  /** Verifica la firma e normalizza il payload del webhook in un PspEvent. */
  parseWebhook(rawBody: string, signature?: string): PspEvent;
}

/** Provider fake per sandbox/test: deterministico, nessuna rete. */
export class FakeProvider implements PaymentProvider {
  private seq = 0;

  createCheckout(_intent: CheckoutIntent): CheckoutSession {
    const providerRef = `cs_fake_${++this.seq}`;
    return {providerRef, url: `https://sandbox.tinft.local/checkout/${providerRef}`};
  }

  parseWebhook(rawBody: string, _signature?: string): PspEvent {
    let obj: Partial<PspEvent>;
    try {
      obj = JSON.parse(rawBody) as Partial<PspEvent>;
    } catch {
      throw new DomainError("BAD_WEBHOOK", "payload webhook non valido");
    }
    if (!obj.id || !obj.providerRef || (obj.type !== "payment_succeeded" && obj.type !== "payment_failed")) {
      throw new DomainError("BAD_WEBHOOK", "evento webhook incompleto");
    }
    return {id: obj.id, type: obj.type, providerRef: obj.providerRef};
  }
}
