import {describe, expect, it} from "vitest";
import {
    canAcquireForEvent,
    exitFeeCents,
    isResalePriceAllowed,
    MAX_PER_EVENT,
    resaleCapCents,
    royaltyCents,
    royaltySplitCents
} from "./rules";

describe("regole economiche (mirror on-chain)", () => {
    it("royalty 1% del prezzo originale (R1)", () => {
        expect(royaltyCents(10_000)).toBe(100); // €100 → €1,00
        expect(royaltyCents(3_150)).toBe(31); // €31,50 → €0,31
    });

    it("split 0,5/0,5 con resto all'organizzatore (R1)", () => {
        expect(royaltySplitCents(10_000)).toEqual({tinftCents: 50, organizerCents: 50});
        expect(royaltySplitCents(3_150)).toEqual({tinftCents: 15, organizerCents: 16}); // 31 → 15+16
    });

    it("tetto rivendita +5% sul costo base (R2)", () => {
        expect(resaleCapCents(10_000)).toBe(10_500);
        expect(resaleCapCents(3_150)).toBe(3_307);
        expect(isResalePriceAllowed(3_307, 3_150)).toBe(true);
        expect(isResalePriceAllowed(3_308, 3_150)).toBe(false);
    });

    it("fee d'uscita export libero 25% (R5)", () => {
        expect(exitFeeCents(10_000)).toBe(2_500);
        expect(exitFeeCents(3_150)).toBe(787); // 787,5 → 787 (troncato)
    });

    it("limite 2 per evento per identità (R4)", () => {
        expect(canAcquireForEvent(0)).toBe(true);
        expect(canAcquireForEvent(MAX_PER_EVENT - 1)).toBe(true);
        expect(canAcquireForEvent(MAX_PER_EVENT)).toBe(false);
    });
});
