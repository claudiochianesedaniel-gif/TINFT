import {DomainError} from "../domain/models";

/**
 * Invio email transazionali (OTP di registrazione). Astratto dietro un'interfaccia
 * così è sostituibile: in produzione {@link ResendEmailSender} (provider Resend),
 * in sviluppo/test {@link DevEmailSender} (nessun invio, il codice resta visibile
 * come `devCode`). La scelta avviene da ambiente con {@link emailSenderFromEnv}.
 */
export interface EmailSender {
  /** true solo per il fallback dev: è lecito restituire il codice nella risposta API. */
  readonly exposesDevCode: boolean;
  /** Invia il codice OTP all'indirizzo. Lancia se l'invio reale fallisce. */
  sendOtp(email: string, code: string): Promise<void>;
}

/** Fallback senza provider: non invia nulla; il codice è mostrato come `devCode` (solo dev/test). */
export class DevEmailSender implements EmailSender {
  readonly exposesDevCode = true;
  async sendOtp(): Promise<void> {
    // no-op: nessun provider configurato → si usa il devCode in risposta
  }
}

/** Invia l'OTP via Resend (HTTPS API, nessuna dipendenza extra: usa `fetch`). */
export class ResendEmailSender implements EmailSender {
  readonly exposesDevCode = false;
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async sendOtp(email: string, code: string): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {Authorization: `Bearer ${this.apiKey}`, "content-type": "application/json"},
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject: "Il tuo codice TINFT",
        html:
          `<p>Il tuo codice di verifica TINFT è <b style="font-size:22px;letter-spacing:3px">${code}</b>.</p>` +
          `<p>Scade tra 10 minuti. Se non hai richiesto tu la registrazione, ignora questa email.</p>`,
        text: `Codice di verifica TINFT: ${code} (scade tra 10 minuti).`
      })
    });
    if (!res.ok) {
      throw new DomainError("EMAIL_SEND_FAILED", `invio OTP fallito (HTTP ${res.status})`, 502);
    }
  }
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
