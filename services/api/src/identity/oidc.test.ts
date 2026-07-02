import {afterEach, describe, expect, it, vi} from "vitest";
import {generateKeyPairSync, sign as cryptoSign} from "node:crypto";
import {JwksOidcVerifier, profileFromClaims} from "./oidc";

/**
 * FASE 5 — verifica id_token OIDC lato server: firma RS256 contro le JWKS del
 * provider (qui: coppia RSA generata nel test + fetch stubbato), issuer, audience,
 * scadenza. Nessuna rete reale.
 */
const {privateKey, publicKey} = generateKeyPairSync("rsa", {modulusLength: 2048});
const JWK = {...publicKey.export({format: "jwk"}), kid: "k1", alg: "RS256"};

const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");

/** Firma un id_token RS256 con la chiave del test (come farebbe il provider). */
function idToken(payload: Record<string, unknown>, header: Record<string, unknown> = {alg: "RS256", kid: "k1"}): string {
  const data = `${b64(header)}.${b64(payload)}`;
  const sig = cryptoSign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url");
  return `${data}.${sig}`;
}

const exp = Math.floor(Date.now() / 1000) + 600;
const GOOGLE_CLAIMS = {
  iss: "https://accounts.google.com",
  aud: "tinft-google-client",
  sub: "g-sub-1",
  exp,
  email: "marco@gmail.com",
  email_verified: true,
  given_name: "Marco",
  family_name: "Bianchi"
};

function makeVerifier() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ok: true, json: async () => ({keys: [JWK]})}))
  );
  return new JwksOidcVerifier({google: "tinft-google-client", apple: "tinft-apple-client"});
}

afterEach(() => vi.unstubAllGlobals());

describe("JwksOidcVerifier", () => {
  it("id_token Google valido → profilo normalizzato (una sola fetch JWKS: cache)", async () => {
    const v = makeVerifier();
    const profile = await v.verify("google", idToken(GOOGLE_CLAIMS));
    expect(profile).toEqual({
      provider: "google", subject: "g-sub-1", email: "marco@gmail.com",
      emailVerified: true, givenName: "Marco", familyName: "Bianchi"
    });
    await v.verify("google", idToken(GOOGLE_CLAIMS));
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1); // JWKS in cache
  });

  it("apple: issuer/audience propri; email_verified anche come stringa", async () => {
    const v = makeVerifier();
    const profile = await v.verify(
      "apple",
      idToken({iss: "https://appleid.apple.com", aud: "tinft-apple-client", sub: "a-1", exp, email: "m@icloud.com", email_verified: "true"})
    );
    expect(profile.subject).toBe("a-1");
    expect(profile.emailVerified).toBe(true);
  });

  it("firma manomessa → BAD_ID_TOKEN 401 (payload alterato dopo la firma)", async () => {
    const v = makeVerifier();
    const good = idToken(GOOGLE_CLAIMS);
    const [h, , s] = good.split(".") as [string, string, string];
    const forged = `${h}.${b64({...GOOGLE_CLAIMS, sub: "attacker"})}.${s}`;
    await expect(v.verify("google", forged)).rejects.toMatchObject({code: "BAD_ID_TOKEN"});
  });

  it("audience sbagliata / token scaduto / alg non RS256 → BAD_ID_TOKEN", async () => {
    const v = makeVerifier();
    await expect(v.verify("google", idToken({...GOOGLE_CLAIMS, aud: "altra-app"}))).rejects.toMatchObject({code: "BAD_ID_TOKEN"});
    await expect(v.verify("google", idToken({...GOOGLE_CLAIMS, exp: 1}))).rejects.toMatchObject({code: "BAD_ID_TOKEN"});
    await expect(
      v.verify("google", idToken(GOOGLE_CLAIMS, {alg: "HS256", kid: "k1"}))
    ).rejects.toMatchObject({code: "BAD_ID_TOKEN"});
  });

  it("kid sconosciuto: rifetcha le JWKS una volta, poi BAD_ID_TOKEN", async () => {
    const v = makeVerifier();
    await expect(
      v.verify("google", idToken(GOOGLE_CLAIMS, {alg: "RS256", kid: "ruotata"}))
    ).rejects.toMatchObject({code: "BAD_ID_TOKEN"});
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2); // cache + refetch per rotazione
  });

  it("provider senza client id configurato → PROVIDER_NOT_CONFIGURED 501", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const v = new JwksOidcVerifier({google: "solo-google"});
    await expect(v.verify("apple", "x.y.z")).rejects.toMatchObject({code: "PROVIDER_NOT_CONFIGURED", status: 501});
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe("profileFromClaims (claim già verificati in firma)", () => {
  it("issuer google in entrambe le varianti; aud anche come array", () => {
    const p = profileFromClaims("google", {...GOOGLE_CLAIMS, iss: "accounts.google.com", aud: ["x", "tinft-google-client"]}, "tinft-google-client");
    expect(p.subject).toBe("g-sub-1");
  });
  it("issuer estraneo o sub mancante → BAD_ID_TOKEN", () => {
    expect(() => profileFromClaims("google", {...GOOGLE_CLAIMS, iss: "https://evil.example"}, "tinft-google-client")).toThrowError(/issuer/);
    expect(() => profileFromClaims("google", {...GOOGLE_CLAIMS, sub: undefined}, "tinft-google-client")).toThrowError(/sub/);
  });
});
