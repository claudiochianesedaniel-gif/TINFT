import {DomainError} from "../domain/models";
import type {CheckoutIntent, CheckoutSession, PspEvent} from "./types";

/**
 * Astrazione del Payment Service Provider (Stripe/Nexi). L'API dipende solo da
 * questa interfaccia; gli adapter reali si attivano via env.
 */
export interface PaymentProvider {
  createCheckout(intent: CheckoutIntent): Promise<CheckoutSession>;
  /** Verifica la firma e normalizza il webhook; `null` per eventi non rilevanti. */
  parseWebhook(rawBody: string, signature?: string): PspEvent | null;
}

/** Provider fake per sandbox/test: deterministico, nessuna rete. */
export class FakeProvider implements PaymentProvider {
  private seq = 0;

  async createCheckout(_intent: CheckoutIntent): Promise<CheckoutSession> {
    const providerRef = `cs_fake_${++this.seq}`;
    return {providerRef, url: `https://sandbox.tinft.local/checkout/${providerRef}`};
  }

  parseWebhook(rawBody: string, _signature?: string): PspEvent | null {
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
