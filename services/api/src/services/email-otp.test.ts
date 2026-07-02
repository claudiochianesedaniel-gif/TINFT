import {describe, expect, it} from "vitest";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "./ticketing";
import {DevEmailSender, ResendEmailSender, emailSenderFromEnv, type EmailSender} from "../notifications/email";

/** Sender di test: cattura ciò che verrebbe inviato (come un provider reale, niente devCode). */
class SpyEmailSender implements EmailSender {
  readonly exposesDevCode = false;
  sent: Array<{email: string; code: string}> = [];
  async sendOtp(email: string, code: string): Promise<void> {
    this.sent.push({email, code});
  }
  async send(): Promise<void> {
    // le email di prodotto (conferma/promemoria) sono coperte da email-events.test.ts
  }
}

const REG = {nome: "Marco", cognome: "Bianchi", cf: "BNCMRC90A01F205X", email: "mb@e.it", city: "Milano"};

function setup(start = 1000, email: EmailSender = new SpyEmailSender()) {
  const store = new MemoryStore();
  const clock = {t: start};
  const service = new TicketingService(store, () => clock.t, undefined, undefined, email);
  return {store, clock, service, email};
}

describe("Registrazione email + OTP (Fase 3 — invio reale dietro interfaccia)", () => {
  it("startEmailRegistration invia l'OTP via sender e NON espone il devCode (provider reale)", async () => {
    const spy = new SpyEmailSender();
    const {service} = setup(1000, spy);
    const res = await service.startEmailRegistration(REG);
    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0]!.email).toBe("mb@e.it");
    expect(spy.sent[0]!.code).toMatch(/^\d{6}$/);
    expect(res.devCode).toBeUndefined(); // col provider reale il codice non torna in risposta
  });

  it("codice corretto → account verificato; codice errato → BAD_CODE", async () => {
    const spy = new SpyEmailSender();
    const {service} = setup(1000, spy);
    await service.startEmailRegistration(REG);
    const code = spy.sent[0]!.code;
    await expect(service.verifyEmailRegistration("mb@e.it", "000000")).rejects.toThrowError(/codice/i);
    const account = await service.verifyEmailRegistration("mb@e.it", code);
    expect(account.role).toBe("CLIENTE");
    expect(account.verified).toBe(true);
    expect(account.cfHash).toMatch(/^0x/);
  });

  it("codice SCADUTO dopo 10 minuti → CODE_EXPIRED e pending consumato", async () => {
    const spy = new SpyEmailSender();
    const {service, clock} = setup(1000, spy);
    await service.startEmailRegistration(REG);
    const code = spy.sent[0]!.code;
    clock.t += 601; // > 600s
    await expect(service.verifyEmailRegistration("mb@e.it", code)).rejects.toThrowError(/scadut/i);
    // pending consumato: anche un retry entro tempo non funziona più
    await expect(service.verifyEmailRegistration("mb@e.it", code)).rejects.toThrowError(/codice/i);
  });

  it("fallback dev (nessun provider) → devCode esposto in risposta", async () => {
    const {service} = setup(1000, new DevEmailSender());
    const res = await service.startEmailRegistration(REG);
    expect(res.devCode).toMatch(/^\d{6}$/);
  });

  it("emailSenderFromEnv sceglie Resend se RESEND_API_KEY è presente, altrimenti dev", () => {
    expect(emailSenderFromEnv({} as NodeJS.ProcessEnv)).toBeInstanceOf(DevEmailSender);
    const real = emailSenderFromEnv({RESEND_API_KEY: "re_test", EMAIL_FROM: "no-reply@tinft.io"} as unknown as NodeJS.ProcessEnv);
    expect(real).toBeInstanceOf(ResendEmailSender);
    expect(real.exposesDevCode).toBe(false);
  });
});
