import {describe, expect, it} from "vitest";
import {checkConfig, validateConfig} from "./config";

describe("config — validazione env al boot", () => {
  it("ambiente vuoto: solo warning su AUTH_SECRET, nessun errore", () => {
    const issues = checkConfig({});
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(issues.some((i) => i.level === "warn" && /AUTH_SECRET/.test(i.message))).toBe(true);
  });

  it("produzione senza AUTH_SECRET → errore", () => {
    const issues = checkConfig({NODE_ENV: "production"});
    expect(issues.some((i) => i.level === "error" && /AUTH_SECRET/.test(i.message))).toBe(true);
  });

  it("Stripe senza webhook secret → errore", () => {
    const issues = checkConfig({AUTH_SECRET: "x", STRIPE_SECRET_KEY: "sk_test_123"});
    expect(issues.some((i) => i.level === "error" && /STRIPE_WEBHOOK_SECRET/.test(i.message))).toBe(true);
  });

  it("config on-chain parziale → errore; completa e valida → nessun errore", () => {
    const partial = checkConfig({AUTH_SECRET: "x", CHAIN_RPC_URL: "http://localhost:8545"});
    expect(partial.some((i) => i.level === "error")).toBe(true);
    const full = checkConfig({
      AUTH_SECRET: "x",
      CHAIN_RPC_URL: "http://localhost:8545",
      CHAIN_PRIVATE_KEY: "0x" + "a".repeat(64),
      TICKET_ADDRESS: "0x" + "b".repeat(40)
    });
    expect(full.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("TICKET_ADDRESS malformato → errore", () => {
    const issues = checkConfig({
      AUTH_SECRET: "x",
      CHAIN_RPC_URL: "u",
      CHAIN_PRIVATE_KEY: "0x" + "a".repeat(64),
      TICKET_ADDRESS: "0xZZZ"
    });
    expect(issues.some((i) => i.level === "error" && /TICKET_ADDRESS/.test(i.message))).toBe(true);
  });

  it("validateConfig lancia sugli errori, non sui soli warning", () => {
    const silent = {warn: () => {}};
    expect(() => validateConfig({NODE_ENV: "production"}, silent)).toThrow(/Configurazione non valida/);
    expect(() => validateConfig({AUTH_SECRET: "x"}, silent)).not.toThrow();
  });
});
