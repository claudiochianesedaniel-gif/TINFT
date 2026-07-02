import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";
import {DomainError} from "../domain/models";
import type {OidcProfile, OidcProviderName, OidcVerifier} from "../identity/oidc";

/**
 * FASE 5 — POST /auth/oidc: login veloce Apple/Google. Il verifier è iniettato
 * (la crittografia è coperta da identity/oidc.test.ts): qui si testa il flusso
 * account — creazione, ri-login per sub, collegamento a account esistente per email.
 */
class FakeOidc implements OidcVerifier {
  /** idToken atteso → profilo restituito. */
  profiles = new Map<string, OidcProfile>();
  async verify(provider: OidcProviderName, idToken: string): Promise<OidcProfile> {
    const p = this.profiles.get(idToken);
    if (!p || p.provider !== provider) throw new DomainError("BAD_ID_TOKEN", "id_token non valido", 401);
    return p;
  }
}

describe("API HTTP — /auth/oidc (Sign in with Apple / Google)", () => {
  let app: FastifyInstance;
  let oidc: FakeOidc;
  beforeEach(() => {
    oidc = new FakeOidc();
    app = buildServer({oidc});
  });
  afterEach(async () => {
    await app.close();
  });

  const post = (url: string, payload: unknown, headers?: Record<string, string>) =>
    app.inject({method: "POST", url, payload: payload as object, headers});

  it("primo login Google → 201 account CLIENTE creato + token di sessione funzionante", async () => {
    oidc.profiles.set("tok-g1", {
      provider: "google", subject: "g-1", email: "marco@gmail.com", emailVerified: true, givenName: "Marco", familyName: "Bianchi"
    });
    const r = await post("/auth/oidc", {provider: "google", idToken: "tok-g1"});
    expect(r.statusCode).toBe(201);
    const {token, account, created} = r.json();
    expect(created).toBe(true);
    expect(account.role).toBe("CLIENTE");
    expect(account.nome).toBe("Marco");
    expect(account.googleSub).toBe("g-1");

    // il token emesso apre le rotte autenticate
    const me = await app.inject({method: "GET", url: `/accounts/${account.id}/tickets`, headers: {authorization: `Bearer ${token}`}});
    expect(me.statusCode).toBe(200);

    // secondo login stesso sub → 200, stesso account, nessun duplicato
    const again = await post("/auth/oidc", {provider: "google", idToken: "tok-g1"});
    expect(again.statusCode).toBe(200);
    expect(again.json().account.id).toBe(account.id);
    expect(again.json().created).toBe(false);
  });

  it("account esistente con la stessa email → COLLEGATO (niente doppione); poi il sub basta da solo", async () => {
    const existing = (await post("/accounts", {nome: "Giulia", cognome: "Verdi", email: "giulia@e.it", password: "1234"})).json();

    oidc.profiles.set("tok-a1", {provider: "apple", subject: "a-1", email: "GIULIA@e.it"}); // email case-insensitive
    const r = await post("/auth/oidc", {provider: "apple", idToken: "tok-a1"});
    expect(r.statusCode).toBe(200);
    expect(r.json().account.id).toBe(existing.id);
    expect(r.json().account.appleSub).toBe("a-1");

    // login successivo SENZA email nel token (Apple può ometterla): trova per sub
    oidc.profiles.set("tok-a2", {provider: "apple", subject: "a-1"});
    const bySub = await post("/auth/oidc", {provider: "apple", idToken: "tok-a2"});
    expect(bySub.statusCode).toBe(200);
    expect(bySub.json().account.id).toBe(existing.id);
  });

  it("token senza email e sub sconosciuto → 400 OIDC_EMAIL_REQUIRED", async () => {
    oidc.profiles.set("tok-noemail", {provider: "apple", subject: "a-nuovo"});
    const r = await post("/auth/oidc", {provider: "apple", idToken: "tok-noemail"});
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("OIDC_EMAIL_REQUIRED");
  });

  it("id_token non valido → 401; provider fuori enum → 400 VALIDATION", async () => {
    const bad = await post("/auth/oidc", {provider: "google", idToken: "sconosciuto"});
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error).toBe("BAD_ID_TOKEN");

    const enumErr = await post("/auth/oidc", {provider: "facebook", idToken: "x"});
    expect(enumErr.statusCode).toBe(400);
    expect(enumErr.json().error).toBe("VALIDATION");
  });

  it("stesso utente su provider DIVERSI con stessa email → un solo account con entrambi i sub", async () => {
    oidc.profiles.set("tok-g", {provider: "google", subject: "g-9", email: "uno@e.it", givenName: "U", familyName: "No"});
    oidc.profiles.set("tok-a", {provider: "apple", subject: "a-9", email: "uno@e.it"});

    const first = (await post("/auth/oidc", {provider: "google", idToken: "tok-g"})).json();
    const second = (await post("/auth/oidc", {provider: "apple", idToken: "tok-a"})).json();
    expect(second.account.id).toBe(first.account.id);
    expect(second.account.googleSub).toBe("g-9");
    expect(second.account.appleSub).toBe("a-9");
  });
});
