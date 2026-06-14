import {describe, expect, it} from "vitest";
import {MemoryStore} from "./memory";
import type {Account} from "../domain/models";

const acc = (id: string, email: string): Account => ({
  id,
  role: "CLIENTE",
  nome: "Marco",
  cognome: "Bianchi",
  email,
  verified: true,
  goodwill: 5
});

describe("persistenza store (snapshot/restore)", () => {
  it("round-trip via JSON conserva dati, ledger e contatori", () => {
    const a = new MemoryStore();
    const id1 = a.id("acc"); // avanza il contatore seq.acc
    a.accounts.set(id1, acc(id1, "marco@e.it"));
    const tok = a.nextTokenId(); // avanza tokenSeq
    a.ledger.presaleCommissionCents = 315;
    a.processedWebhooks.add("evt_1");

    // serializza come farebbe il file su disco
    const snap = JSON.parse(JSON.stringify(a.snapshot()));

    const b = new MemoryStore();
    b.restore(snap);

    expect(b.accounts.get(id1)?.email).toBe("marco@e.it");
    expect(b.ledger.presaleCommissionCents).toBe(315);
    expect(b.processedWebhooks.has("evt_1")).toBe(true);
    expect(b.artists.size).toBeGreaterThan(0); // contenuti seedati conservati
    // i contatori proseguono senza collisioni dopo il restore
    expect(b.id("acc")).not.toBe(id1);
    expect(b.nextTokenId()).toBe(tok + 1);
  });

  it("restore tollera uno snapshot parziale", () => {
    const b = new MemoryStore();
    expect(() => b.restore({accounts: [[`acc_1`, acc("acc_1", "x@e.it")]]} as never)).not.toThrow();
    expect(b.accounts.get("acc_1")?.email).toBe("x@e.it");
  });
});
