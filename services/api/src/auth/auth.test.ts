import {describe, expect, it} from "vitest";
import type {Account} from "../domain/models";
import {hashPassword, setPassword, verifyHash, verifyPassword} from "./password";
import {DEFAULT_TTL_SECONDS, signToken, verifyToken} from "./tokens";
import {buildServer} from "../http/server";

function fakeAccount(): Account {
  return {
    id: "acc_1",
    role: "CLIENTE",
    nome: "M",
    cognome: "B",
    email: "m@e.it",
    verified: false,
    goodwill: 0
  };
}

describe("auth — password (scrypt)", () => {
  it("hash/verify round-trip; formato salt:hash", () => {
    const stored = hashPassword("segreto1");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyHash("segreto1", stored)).toBe(true);
    expect(verifyHash("sbagliata", stored)).toBe(false);
  });

  it("hash diversi per la stessa password (salt casuale)", () => {
    expect(hashPassword("ripetuta")).not.toBe(hashPassword("ripetuta"));
  });

  it("rifiuta password troppo corte (<4)", () => {
    expect(() => hashPassword("123")).toThrow(/almeno 4/);
  });

  it("setPassword/verifyPassword sull'account", () => {
    const a = fakeAccount();
    setPassword(a, "1234"); // i dati demo possono usare "1234"
    expect(a.passwordHash).toBeDefined();
    expect(verifyPassword(a, "1234")).toBe(true);
    expect(verifyPassword(a, "0000")).toBe(false);
  });

  it("verifyPassword falso se l'account non ha password", () => {
    expect(verifyPassword(fakeAccount(), "qualcosa")).toBe(false);
  });
});

describe("auth — token (HMAC-SHA256)", () => {
  it("sign/verify round-trip con accountId/role/iat/exp", () => {
    const token = signToken({accountId: "acc_42", role: "ORGANIZER"});
    expect(token.split(".")).toHaveLength(3);
    const payload = verifyToken(token);
    expect(payload.accountId).toBe("acc_42");
    expect(payload.role).toBe("ORGANIZER");
    expect(payload.exp - payload.iat).toBe(DEFAULT_TTL_SECONDS);
  });

  it("rifiuta token manomessi (firma non valida)", () => {
    const token = signToken({accountId: "acc_1", role: "CLIENTE"});
    const [head, body, sig] = token.split(".");
    // payload alterato, firma originale → mismatch
    const forgedBody = Buffer.from(JSON.stringify({accountId: "acc_999", role: "PLATFORM", iat: 1, exp: 9999999999}))
      .toString("base64url");
    expect(() => verifyToken(`${head}.${forgedBody}.${sig}`)).toThrow(/firma/);
    // firma corrotta
    expect(() => verifyToken(`${head}.${body}.${sig}x`)).toThrow();
    // formato errato
    expect(() => verifyToken("non-un-token")).toThrow(/malformato/);
    expect(() => verifyToken(undefined)).toThrow(/mancante/);
  });

  it("rifiuta token scaduti", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const expired = signToken({accountId: "acc_1", role: "CLIENTE", iat: past - 100, exp: past});
    expect(() => verifyToken(expired)).toThrow(/scaduto/);
  });
});

describe("auth — login HTTP", () => {
  it("login con password giusta → token + account; sbagliata → 401", async () => {
    const app = buildServer();
    try {
      const created = await app.inject({
        method: "POST",
        url: "/accounts",
        payload: {nome: "M", cognome: "B", email: "login@e.it", password: "1234"}
      });
      expect(created.statusCode).toBe(201);

      const ok = await app.inject({method: "POST", url: "/auth/login", payload: {email: "login@e.it", password: "1234"}});
      expect(ok.statusCode).toBe(200);
      expect(ok.json().token.split(".")).toHaveLength(3);
      expect(ok.json().account.email).toBe("login@e.it");

      const wrong = await app.inject({method: "POST", url: "/auth/login", payload: {email: "login@e.it", password: "x"}});
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().error).toBe("BAD_CREDENTIALS");

      const missing = await app.inject({method: "POST", url: "/auth/login", payload: {email: "nope@e.it", password: "1234"}});
      expect(missing.statusCode).toBe(401);
      expect(missing.json().error).toBe("BAD_CREDENTIALS");
    } finally {
      await app.close();
    }
  });
});
