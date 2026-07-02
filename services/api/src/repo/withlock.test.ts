import {describe, expect, it} from "vitest";
import {MemoryStore} from "./memory";

/**
 * Store.withLock (FASE 7): mutua esclusione per-chiave. Qui si testa il
 * MemoryStore (in-processo); l'equivalente Postgres cross-istanza
 * (pg_advisory_xact_lock) è coperto da prisma-store.it.test.ts con DATABASE_URL.
 */
describe("MemoryStore.withLock — mutex per-chiave", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("serializza le chiamate sulla STESSA chiave (niente sezioni critiche sovrapposte)", async () => {
    const store = new MemoryStore();
    let inside = 0;
    let maxInside = 0;
    const critical = async () => {
      inside++;
      maxInside = Math.max(maxInside, inside);
      await sleep(5); // simula lavoro async (lettura+scrittura non atomica)
      inside--;
    };

    await Promise.all([1, 2, 3, 4].map(() => store.withLock("k", critical)));
    expect(maxInside).toBe(1); // mai due dentro contemporaneamente
  });

  it("chiavi DIVERSE non si bloccano a vicenda", async () => {
    const store = new MemoryStore();
    const order: string[] = [];
    await Promise.all([
      store.withLock("a", async () => {
        await sleep(20);
        order.push("a");
      }),
      store.withLock("b", async () => {
        order.push("b");
      })
    ]);
    expect(order).toEqual(["b", "a"]); // b non ha aspettato il lock di a
  });

  it("un errore nel corpo NON avvelena la catena: la chiamata successiva gira", async () => {
    const store = new MemoryStore();
    await expect(store.withLock("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(store.withLock("k", async () => "ok")).resolves.toBe("ok");
  });
});
