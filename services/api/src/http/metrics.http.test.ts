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

  it("senza adapter on-chain non espone metriche di gas (FakeChain non ha un wallet)", async () => {
    const res = await app.inject({method: "GET", url: "/metrics"});
    expect(res.body).not.toContain("tinft_chain_gas_balance_wei");
    const ready = await app.inject({method: "GET", url: "/ready"});
    expect(ready.json()).not.toHaveProperty("gasWei");
  });

  it("con adapter on-chain espone il saldo gas e segnala quando è sotto soglia", async () => {
    const LOW = 1_000n; // ben sotto la soglia di allarme (0,00005 ETH)
    const withGas = buildServer({
      store: new MemoryStore(),
      chain: {
        mintTicket: async () => ({tokenId: 1, txHash: "0x1"}),
        gasBalanceWei: async () => LOW
      }
    });
    try {
      const metrics = await withGas.inject({method: "GET", url: "/metrics"});
      expect(metrics.body).toContain(`tinft_chain_gas_balance_wei ${LOW}`);
      expect(metrics.body).toContain("tinft_chain_gas_low 1"); // allarme acceso

      const ready = await withGas.inject({method: "GET", url: "/ready"});
      expect(ready.json()).toMatchObject({ready: true, gasWei: LOW.toString(), lowGas: true});
    } finally {
      await withGas.close();
    }
  });

  it("un errore RPC sul saldo non fa fallire /ready (il servizio resta utilizzabile)", async () => {
    const flaky = buildServer({
      store: new MemoryStore(),
      chain: {
        mintTicket: async () => ({tokenId: 1, txHash: "0x1"}),
        gasBalanceWei: async () => {
          throw new Error("RPC irraggiungibile");
        }
      }
    });
    try {
      const ready = await flaky.inject({method: "GET", url: "/ready"});
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toMatchObject({ready: true});
      expect(ready.json()).not.toHaveProperty("lowGas");
    } finally {
      await flaky.close();
    }
  });
});
