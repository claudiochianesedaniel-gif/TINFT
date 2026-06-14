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
}

export interface CheckoutSession {
  providerRef: string;
  url: string;
}

/** Evento normalizzato dal webhook del PSP. */
export interface PspEvent {
  id: string; // id evento PSP (chiave di idempotenza)
  type: "payment_succeeded" | "payment_failed";
  providerRef: string; // sessione di checkout a cui si riferisce
  orderId?: string; // riferimento d'ordine letto dai metadati (se presente)
}
