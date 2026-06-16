import {createHmac, timingSafeEqual} from "node:crypto";
import {type AccountRole, DomainError} from "../domain/models";

// Segreto per la firma HMAC dei token (in produzione: variabile d'ambiente).
const SECRET = process.env.AUTH_SECRET ?? "dev-secret";

// Durata di default del token: ~7 giorni.
export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPayload {
  accountId: string;
  role: AccountRole;
  iat: number; // emesso a (epoch seconds)
  exp: number; // scadenza (epoch seconds)
}

const HEADER = {alg: "HS256", typ: "JWT"} as const;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** base64url encode di una stringa UTF-8. */
function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

/** Firma HMAC-SHA256 (base64url) della parte `header.payload`. */
function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

/**
 * Firma un token compatto in stile JWT: base64url(header).base64url(payload).base64url(hmac).
 * Aggiunge `iat`/`exp` (default ~7 giorni) se non già presenti nel payload.
 */
export function signToken(
  payload: {accountId: string; role: AccountRole; iat?: number; exp?: number},
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const iat = payload.iat ?? nowSeconds();
  const exp = payload.exp ?? iat + ttlSeconds;
  const full: TokenPayload = {accountId: payload.accountId, role: payload.role, iat, exp};
  const head = b64url(JSON.stringify(HEADER));
  const body = b64url(JSON.stringify(full));
  const data = `${head}.${body}`;
  return `${data}.${sign(data)}`;
}

/** Confronto a tempo costante di due firme base64url. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Verifica firma e scadenza di un token. Lancia DomainError("BAD_TOKEN",…,401) se
 * il formato è errato, la firma non corrisponde (tamper) o il token è scaduto.
 */
export function verifyToken(token: string | undefined): TokenPayload {
  if (!token) throw new DomainError("BAD_TOKEN", "token mancante", 401);
  const parts = token.split(".");
  if (parts.length !== 3) throw new DomainError("BAD_TOKEN", "token malformato", 401);
  const [head, body, sig] = parts as [string, string, string];
  if (!safeEqual(sig, sign(`${head}.${body}`))) {
    throw new DomainError("BAD_TOKEN", "firma non valida", 401);
  }
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    throw new DomainError("BAD_TOKEN", "payload non valido", 401);
  }
  if (typeof payload.exp !== "number" || nowSeconds() >= payload.exp) {
    throw new DomainError("TOKEN_EXPIRED", "token scaduto", 401);
  }
  return payload;
}
