// Tipi pagamenti (M7). PSP-agnostici: l'adapter Stripe/Nexi li implementa.

export type PaymentKind = "PRIMARY" | "SECONDARY" | "EXIT_FEE";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED";

export interface Payment {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amountCents: number;
  currency: string; // "EUR"
  accountId: string;
  eventId?: string;
  orderId?: string; // ordine v2 collegato (checkout multi-biglietto)
  ticketId?: string;
  providerRef: string; // id della sessione di checkout del PSP
  ticketMintedId?: string; // biglietto coniato a pagamento avvenuto
  createdAt: number;
}

export interface CheckoutIntent {
  kind: PaymentKind;
  amountCents: number;
  currency: string;
  accountId: string;
  eventId?: string;
  orderId?: string; // riferimento d'ordine portato nei metadati della sessione PSP
  // Split marketplace (Stripe Connect): l'incasso va all'account connesso
  // dell'organizzatore, TINFT trattiene la application fee (prevendita 10%).
  destinationAccountId?: string; // account Stripe connesso del club/organizzatore
  applicationFeeCents?: number; // quota TINFT trattenuta sull'incasso
}

export interface CheckoutSession {
  providerRef: string;
  url: string;
}

/** Evento normalizzato dal webhook del PSP. */
export interface PspEvent {
  id: string; // id evento PSP (chiave di idempotenza)
  type: "payment_succeeded" | "payment_failed" | "payment_refunded" | "account_updated";
  providerRef: string; // sessione di checkout; per account_updated è l'id dell'account connesso
  orderId?: string; // riferimento d'ordine letto dai metadati (se presente)
  chargesEnabled?: boolean; // solo account_updated: onboarding Connect completato
}
