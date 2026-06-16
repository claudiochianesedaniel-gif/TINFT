import {describe, expect, it} from "vitest";
import {referenceToOnchainEventId, viemChainForId} from "./viem";

describe("referenceToOnchainEventId", () => {
  it("è deterministica e stabile (stesso input → stesso eventId)", () => {
    expect(referenceToOnchainEventId("evt_1")).toBe(referenceToOnchainEventId("evt_1"));
  });

  it("evita collisioni tra reference diverse (anche simili)", () => {
    const refs = ["evt_1", "evt_2", "evt_10", "evt_100", "evt_1 ", "EVT_1", "abc"];
    const ids = new Set(refs.map(referenceToOnchainEventId));
    expect(ids.size).toBe(refs.length);
  });

  it("resta nel range di un uint256", () => {
    const id = referenceToOnchainEventId("evt_qualsiasi");
    expect(id).toBeGreaterThanOrEqual(0n);
    expect(id).toBeLessThan(2n ** 256n);
  });
});

describe("viemChainForId", () => {
  it("mappa gli id noti (84532=Base Sepolia, 8453=Base, 31337=anvil)", () => {
    expect(viemChainForId(84532)?.id).toBe(84532);
    expect(viemChainForId(8453)?.id).toBe(8453);
    expect(viemChainForId(31337)?.id).toBe(31337);
  });

  it("restituisce undefined per id sconosciuti o assenti", () => {
    expect(viemChainForId(1)).toBeUndefined();
    expect(viemChainForId(undefined)).toBeUndefined();
  });
});
