import {createPublicKey, verify as cryptoVerify} from "node:crypto";
import {DomainError} from "../domain/models";

// ---------------------------------------------------------------------------
// FASE 5 — Login veloce con Sign in with Apple / Google Sign-In (OIDC).
// Il client ottiene un id_token dal provider e lo manda a POST /auth/oidc; QUI,
// lato server, se ne verifica firma (RS256 via JWKS), issuer, audience e scadenza.
// Nessuna dipendenza nuova: fetch + node:crypto.
// ---------------------------------------------------------------------------

export type OidcProviderName = "apple" | "google";

/** Profilo normalizzato estratto da un id_token verificato. */
export interface OidcProfile {
  provider: OidcProviderName;
  subject: string; // `sub`: id stabile dell'utente presso il provider
  email?: string;
  emailVerified?: boolean;
  givenName?: string;
  familyName?: string;
}

/** Verifica id_token OIDC. Lancia DomainError su token non valido/provider non configurato. */
export interface OidcVerifier {
  verify(provider: OidcProviderName, idToken: string): Promise<OidcProfile>;
}

interface ProviderMeta {
  issuers: string[]; // valori `iss` accettati
  jwksUrl: string;
}

const PROVIDERS: Record<OidcProviderName, ProviderMeta> = {
  apple: {issuers: ["https://appleid.apple.com"], jwksUrl: "https://appleid.apple.com/auth/keys"},
  google: {
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs"
  }
};

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
}

const bad = (msg: string) => new DomainError("BAD_ID_TOKEN", msg, 401);
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Decodifica una sezione base64url → JSON (o lancia BAD_ID_TOKEN). */
function decodeSection<T>(section: string, what: string): T {
  try {
    return JSON.parse(Buffer.from(section, "base64url").toString("utf8")) as T;
  } catch {
    throw bad(`${what} dell'id_token non valido`);
  }
}

export interface IdTokenPayload {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean | "true" | "false";
  given_name?: string;
  family_name?: string;
}

/**
 * Verifica i claim (issuer, audience, scadenza, sub) di un payload GIÀ verificato
 * in firma e lo normalizza in {@link OidcProfile}. Esportata pura per i test.
 */
export function profileFromClaims(provider: OidcProviderName, payload: IdTokenPayload, clientId: string): OidcProfile {
  if (!payload.iss || !PROVIDERS[provider].issuers.includes(payload.iss)) throw bad("issuer non riconosciuto");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(clientId)) throw bad("audience non corrispondente (client id)");
  if (typeof payload.exp !== "number" || nowSeconds() >= payload.exp) throw bad("id_token scaduto");
  if (!payload.sub) throw bad("sub mancante");
  return {
    provider,
    subject: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    givenName: payload.given_name,
    familyName: payload.family_name
  };
}

/**
 * Verifier reale: scarica le JWKS del provider (cache 1h), verifica la firma
 * RS256 dell'id_token e i claim. Si configura con i client id dell'app TINFT
 * ({@link oidcVerifierFromEnv}: APPLE_CLIENT_ID / GOOGLE_CLIENT_ID).
 */
export class JwksOidcVerifier implements OidcVerifier {
  private readonly jwksCache = new Map<OidcProviderName, {keys: Jwk[]; fetchedAt: number}>();
  private static readonly JWKS_TTL_SECONDS = 3600;

  constructor(private readonly clientIds: Partial<Record<OidcProviderName, string>>) {}

  async verify(provider: OidcProviderName, idToken: string): Promise<OidcProfile> {
    const clientId = this.clientIds[provider];
    if (!clientId) {
      throw new DomainError("PROVIDER_NOT_CONFIGURED", `login ${provider} non configurato su questo ambiente`, 501);
    }

    const parts = (idToken ?? "").split(".");
    if (parts.length !== 3) throw bad("id_token malformato");
    const [head, body, sig] = parts as [string, string, string];
    const header = decodeSection<{alg?: string; kid?: string}>(head, "header");
    if (header.alg !== "RS256") throw bad(`algoritmo non supportato: ${header.alg}`);

    const jwk = await this.findKey(provider, header.kid);
    const key = createPublicKey({key: jwk as never, format: "jwk"});
    const ok = cryptoVerify("RSA-SHA256", Buffer.from(`${head}.${body}`), key, Buffer.from(sig, "base64url"));
    if (!ok) throw bad("firma dell'id_token non valida");

    return profileFromClaims(provider, decodeSection<IdTokenPayload>(body, "payload"), clientId);
  }

  /** JWKS del provider con cache; su kid sconosciuto rifetcha una volta (rotazione chiavi). */
  private async findKey(provider: OidcProviderName, kid?: string): Promise<Jwk> {
    for (const fresh of [false, true]) {
      const keys = await this.jwks(provider, fresh);
      const key = keys.find((k) => k.kty === "RSA" && (!kid || k.kid === kid));
      if (key) return key;
    }
    throw bad("chiave di firma non trovata nelle JWKS del provider");
  }

  private async jwks(provider: OidcProviderName, forceRefresh: boolean): Promise<Jwk[]> {
    const cached = this.jwksCache.get(provider);
    if (!forceRefresh && cached && nowSeconds() - cached.fetchedAt < JwksOidcVerifier.JWKS_TTL_SECONDS) {
      return cached.keys;
    }
    const res = await fetch(PROVIDERS[provider].jwksUrl);
    if (!res.ok) throw new DomainError("JWKS_UNAVAILABLE", `JWKS del provider non raggiungibili (HTTP ${res.status})`, 502);
    const {keys} = (await res.json()) as {keys: Jwk[]};
    this.jwksCache.set(provider, {keys: keys ?? [], fetchedAt: nowSeconds()});
    return keys ?? [];
  }
}

/** Configura il verifier dai client id in ambiente; i provider senza client id restano spenti (501). */
export function oidcVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): OidcVerifier {
  return new JwksOidcVerifier({apple: env.APPLE_CLIENT_ID, google: env.GOOGLE_CLIENT_ID});
}
