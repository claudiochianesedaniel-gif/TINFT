import {DomainError} from "../domain/models";

/** Messaggio email generico (transazionale). */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Invio email transazionali (OTP di registrazione, conferma d'ordine, promemoria
 * evento). Astratto dietro un'interfaccia così è sostituibile: in produzione
 * {@link ResendEmailSender} (provider Resend), in sviluppo/test {@link DevEmailSender}
 * (nessun invio, il codice resta visibile come `devCode`). La scelta avviene da
 * ambiente con {@link emailSenderFromEnv}.
 */
export interface EmailSender {
  /** true solo per il fallback dev: è lecito restituire il codice nella risposta API. */
  readonly exposesDevCode: boolean;
  /** Invia il codice OTP all'indirizzo. Lancia se l'invio reale fallisce. */
  sendOtp(email: string, code: string): Promise<void>;
  /** Invia un'email transazionale generica. Lancia se l'invio reale fallisce. */
  send(message: EmailMessage): Promise<void>;
}

/** Fallback senza provider: non invia nulla; il codice è mostrato come `devCode` (solo dev/test). */
export class DevEmailSender implements EmailSender {
  readonly exposesDevCode = true;
  async sendOtp(): Promise<void> {
    // no-op: nessun provider configurato → si usa il devCode in risposta
  }
  async send(): Promise<void> {
    // no-op: nessun provider configurato
  }
}

/** Invia email via Resend (HTTPS API, nessuna dipendenza extra: usa `fetch`). */
export class ResendEmailSender implements EmailSender {
  readonly exposesDevCode = false;
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {Authorization: `Bearer ${this.apiKey}`, "content-type": "application/json"},
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text
      })
    });
    if (!res.ok) {
      throw new DomainError("EMAIL_SEND_FAILED", `invio email fallito (HTTP ${res.status})`, 502);
    }
  }

  async sendOtp(email: string, code: string): Promise<void> {
    await this.send({
      to: email,
      subject: "Il tuo codice TINFT",
      html:
        `<p>Il tuo codice di verifica TINFT è <b style="font-size:22px;letter-spacing:3px">${code}</b>.</p>` +
        `<p>Scade tra 10 minuti. Se non hai richiesto tu la registrazione, ignora questa email.</p>`,
      text: `Codice di verifica TINFT: ${code} (scade tra 10 minuti).`
    });
  }
}

// ---------------------------------------------------------------------------
// Template delle email di prodotto (FASE 8). Funzioni pure: componibili e testabili.
// ---------------------------------------------------------------------------

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Conferma d'ordine: inviata al compratore quando l'ordine risulta PAGATO. */
export function orderConfirmationEmail(input: {
  to: string;
  buyerName: string;
  eventTitle: string;
  venue: string;
  date: string;
  quantity: number;
  totalCents: number;
}): EmailMessage {
  const {to, buyerName, eventTitle, venue, date, quantity, totalCents} = input;
  const plurale = quantity === 1 ? "il tuo biglietto" : `i tuoi ${quantity} biglietti`;
  return {
    to,
    subject: `I tuoi biglietti per ${eventTitle}`,
    html:
      `<p>Ciao ${esc(buyerName)},</p>` +
      `<p>ordine confermato: ${plurale} per <b>${esc(eventTitle)}</b> (${esc(venue)} · ${esc(date)}) ` +
      `${quantity === 1 ? "è" : "sono"} nel tuo wallet TINFT.</p>` +
      `<p>Totale pagato: <b>${euro(totalCents)}</b>.</p>` +
      `<p>All'ingresso apri l'app e mostra il QR del biglietto: si aggiorna da solo, non servono stampe.</p>`,
    text:
      `Ordine confermato: ${quantity} bigliett${quantity === 1 ? "o" : "i"} per ${eventTitle} ` +
      `(${venue} · ${date}). Totale ${euro(totalCents)}. Mostra il QR nell'app all'ingresso.`
  };
}

/** Promemoria evento: inviato ai possessori dei biglietti su richiesta dell'organizzatore. */
export function eventReminderEmail(input: {
  to: string;
  holderName: string;
  eventTitle: string;
  venue: string;
  date: string;
}): EmailMessage {
  const {to, holderName, eventTitle, venue, date} = input;
  return {
    to,
    subject: `Promemoria: ${eventTitle} · ${date}`,
    html:
      `<p>Ciao ${esc(holderName)},</p>` +
      `<p>ti aspettiamo a <b>${esc(eventTitle)}</b> — ${esc(venue)} · ${esc(date)}.</p>` +
      `<p>Il biglietto è nel tuo wallet TINFT: all'ingresso basta il QR nell'app, ` +
      `niente stampe. Il QR ruota automaticamente, gli screenshot non valgono.</p>`,
    text: `Promemoria: ${eventTitle} — ${venue} · ${date}. Il biglietto è nell'app TINFT: mostra il QR all'ingresso.`
  };
}

/**
 * Sceglie l'implementazione dall'ambiente: Resend se `RESEND_API_KEY` è presente
 * (mittente da `EMAIL_FROM`, default il dominio di prova di Resend), altrimenti dev.
 */
export function emailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender {
  if (env.RESEND_API_KEY) {
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM ?? "onboarding@resend.dev");
  }
  return new DevEmailSender();
}
