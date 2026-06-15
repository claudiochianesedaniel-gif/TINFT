import {afterAll, beforeAll, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildServer} from "./server";
import {MemoryStore} from "../repo/memory";

describe("HTTP — request-id + /metrics (osservabilità)", () => {
  let app: FastifyInstance;
  beforeAll(() => {
    app = buildServer({store: new MemoryStore()});
  });
  afterAll(async () => {
    await app.close();
  });

  it("ogni risposta porta x-request-id; se fornito in ingresso viene riusato (correlazione)", async () => {
    const r1 = await app.inject({method: "GET", url: "/health"});
    expect(r1.headers["x-request-id"]).toBeTruthy();
    const r2 = await app.inject({method: "GET", url: "/health", headers: {"x-request-id": "abc-123"}});
    expect(r2.headers["x-request-id"]).toBe("abc-123");
  });

  it("GET /metrics espone i contatori Prometheus (richieste totali + uptime)", async () => {
    await app.inject({method: "GET", url: "/health"}); // genera almeno una richiesta contata
    const res = await app.inject({method: "GET", url: "/metrics"});
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("tinft_http_requests_total");
    expect(res.body).toContain("tinft_process_uptime_seconds");
  });
});
