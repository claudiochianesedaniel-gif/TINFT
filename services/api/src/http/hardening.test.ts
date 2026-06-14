import {afterEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";

describe("hardening", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it("security headers su ogni risposta", async () => {
    app = buildServer();
    const r = await app.inject({method: "GET", url: "/health"});
    expect(r.statusCode).toBe(200);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("rate limit su /auth/login → 429 oltre soglia (anti brute-force)", async () => {
    app = buildServer({rateLimit: true}); // forza il rate-limit anche sotto test
    let last = 0;
    let got429 = false;
    for (let i = 0; i < 35; i++) {
      const r = await app.inject({method: "POST", url: "/auth/login", payload: {email: "x@e.it", password: "nope"}});
      last = r.statusCode;
      if (r.statusCode === 429) got429 = true;
    }
    expect(got429).toBe(true);
    expect(last).toBe(429);
  });

  it("senza override il rate-limit è spento sotto test (login ripetuti ok)", async () => {
    app = buildServer();
    for (let i = 0; i < 25; i++) {
      const r = await app.inject({method: "POST", url: "/auth/login", payload: {email: "x@e.it", password: "nope"}});
      expect(r.statusCode).toBe(401); // credenziali errate, mai 429
    }
  });
});
