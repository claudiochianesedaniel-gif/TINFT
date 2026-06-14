import {createHmac, timingSafeEqual} from "node:crypto";
import {DomainError} from "../domain/models";

// Segreto per la firma HMAC dei token d'accesso (QR del biglietto). In produzione:
// ACCESS_SECRET dedicato; fallback su AUTH_SECRET (stesso del login) e infine dev.
const SECRET = process.env.ACCESS_SECRET ?? process.env.AUTH_SECRET ?? "dev-secret";

/**
 * Durata di default del token d'accesso: 30 secondi. Il QR mostrato dall'app del
 * possessore ruota entro questa finestra, così uno screenshot scade in fretta
 * (→ outcome SCREENSHOT lato validazione).
 */
export const ACCESS_TTL_SECONDS = 30;

export interface AccessTokenPayload {
  ticketId: string;
  iat: number; // emesso a (epoch seconds)
  exp: number; // scadenza (epoch seconds)
}

const HEADER = {alg: "HS256", typ: "ACX"} as const;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** base64url encode di una stringa UTF-8. */
function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

/** Firma HMAC-SHA256 (base64url) della parte `header.payload`. */
function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

/** Confronto a tempo costante di due firme base64url. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Firma un token d'accesso compatto e a vita breve per un biglietto:
 * base64url(header).base64url({ticketId,iat,exp}).base64url(hmac).
 * Default TTL {@link ACCESS_TTL_SECONDS} (rotazione del QR).
 */
export function signAccessToken(ticketId: string, ttlSeconds: number = ACCESS_TTL_SECONDS): string {
  const iat = nowSeconds();
  const exp = iat + ttlSeconds;
  const payload: AccessTokenPayload = {ticketId, iat, exp};
  const head = b64url(JSON.stringify(HEADER));
  const body = b64url(JSON.stringify(payload));
  const data = `${head}.${body}`;
  return `${data}.${sign(data)}`;
}

/**
 * Verifica firma e scadenza di un token d'accesso e restituisce `{ticketId}`.
 * Lancia DomainError("TOKEN_EXPIRED",…,401) se scaduto, DomainError("BAD_TOKEN",…,401)
 * se malformato o manomesso (firma non valida). Confronto a tempo costante.
 */
export function verifyAccessToken(token: string | undefined): {ticketId: string} {
  if (!token) throw new DomainError("BAD_TOKEN", "token d'accesso mancante", 401);
  const parts = token.split(".");
  if (parts.length !== 3) throw new DomainError("BAD_TOKEN", "token d'accesso malformato", 401);
  const [head, body, sig] = parts as [string, string, string];
  if (!safeEqual(sig, sign(`${head}.${body}`))) {
    throw new DomainError("BAD_TOKEN", "firma del token d'accesso non valida", 401);
  }
  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessTokenPayload;
  } catch {
    throw new DomainError("BAD_TOKEN", "payload del token d'accesso non valido", 401);
  }
  if (typeof payload.ticketId !== "string" || !payload.ticketId) {
    throw new DomainError("BAD_TOKEN", "payload del token d'accesso non valido", 401);
  }
  if (typeof payload.exp !== "number" || nowSeconds() >= payload.exp) {
    throw new DomainError("TOKEN_EXPIRED", "token d'accesso scaduto", 401);
  }
  return {ticketId: payload.ticketId};
}
