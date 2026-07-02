import {DomainError} from "../domain/models";
import type {CheckoutIntent, CheckoutSession, PspEvent} from "./types";

/** Stato di un account connesso (Stripe Connect) dell'organizzatore. */
export interface ConnectedAccountStatus {
  accountId: string;
  chargesEnabled: boolean; // onboarding completato: può incassare
}

/**
 * Capacità marketplace (Stripe Connect): un account connesso per organizzatore,
 * creato UNA volta all'onboarding del club; poi ogni evento incassa lì e TINFT
 * trattiene la application fee al checkout.
 */
export interface ConnectPort {
  createConnectedAccount(input: {clubId: string; email?: string; name?: string}): Promise<ConnectedAccountStatus>;
  /** Link di onboarding guidato (Express) da mostrare all'organizzatore. */
  createOnboardingLink(accountId: string): Promise<{url: string}>;
  getAccountStatus(accountId: string): Promise<ConnectedAccountStatus>;
}

/**
 * Astrazione del Payment Service Provider (Stripe/Nexi). L'API dipende solo da
 * questa interfaccia; gli adapter reali si attivano via env.
 */
export interface PaymentProvider {
  createCheckout(intent: CheckoutIntent): Promise<CheckoutSession>;
  /** Verifica la firma e normalizza il webhook; `null` per eventi non rilevanti. */
  parseWebhook(rawBody: string, signature?: string): PspEvent | null;
  /** Capacità Connect (marketplace); assente sui provider che non la supportano. */
  connect?: ConnectPort;
}

/** Connect fake per sandbox/test: account creato e subito operativo, nessuna rete. */
export class FakeConnect implements ConnectPort {
  async createConnectedAccount(input: {clubId: string; email?: string; name?: string}): Promise<ConnectedAccountStatus> {
    return {accountId: `acct_fake_${input.clubId}`, chargesEnabled: true};
  }

  async createOnboardingLink(accountId: string): Promise<{url: string}> {
    return {url: `https://sandbox.tinft.local/connect/${accountId}`};
  }

  async getAccountStatus(accountId: string): Promise<ConnectedAccountStatus> {
    return {accountId, chargesEnabled: true};
  }
}

/** Provider fake per sandbox/test: deterministico, nessuna rete. */
export class FakeProvider implements PaymentProvider {
  private seq = 0;
  readonly connect = new FakeConnect();

  async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
    // id deterministico: per gli ordini include l'orderId così i test possono
    // ricostruire la sessione e fabbricare l'evento "succeeded" corrispondente.
    const providerRef = intent.orderId ? `cs_fake_ord_${intent.orderId}` : `cs_fake_${++this.seq}`;
    return {providerRef, url: `https://sandbox.tinft.local/checkout/${providerRef}`};
  }

  parseWebhook(rawBody: string, _signature?: string): PspEvent | null {
    let obj: Partial<PspEvent>;
    try {
      obj = JSON.parse(rawBody) as Partial<PspEvent>;
    } catch {
      throw new DomainError("BAD_WEBHOOK", "payload webhook non valido");
    }
    if (
      !obj.id ||
      !obj.providerRef ||
      (obj.type !== "payment_succeeded" &&
        obj.type !== "payment_failed" &&
        obj.type !== "payment_refunded" &&
        obj.type !== "account_updated")
    ) {
      throw new DomainError("BAD_WEBHOOK", "evento webhook incompleto");
    }
    return {id: obj.id, type: obj.type, providerRef: obj.providerRef, orderId: obj.orderId, chargesEnabled: obj.chargesEnabled};
  }
}
