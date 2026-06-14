import {describe, expect, it} from "vitest";
import {
    canAcquireForEvent,
    clampOrderQuantity,
    exitFeeCents,
    isResalePriceAllowed,
    MAX_PER_EVENT,
    MAX_PER_ORDER,
    orderTotalCents,
    resaleCapCents,
    royaltyCents,
    royaltySplitCents,
    serviceFeeCents
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

    it("commissione servizio 4% sul primario (R10)", () => {
        expect(serviceFeeCents(3_150)).toBe(126); // €31,50 → €1,26
        expect(serviceFeeCents(10_000)).toBe(400); // €100 → €4,00
        expect(serviceFeeCents(2_400)).toBe(96); // €24 → €0,96
    });

    it("quantità checkout: clamp 1..4", () => {
        expect(clampOrderQuantity(0)).toBe(1);
        expect(clampOrderQuantity(1)).toBe(1);
        expect(clampOrderQuantity(4)).toBe(MAX_PER_ORDER);
        expect(clampOrderQuantity(9)).toBe(MAX_PER_ORDER);
    });

    it("totale checkout = (prezzo + servizio 4%) × quantità", () => {
        const t = orderTotalCents(3_150, 2);
        expect(t.unitPriceCents).toBe(3_150);
        expect(t.serviceFeeCents).toBe(126);
        expect(t.quantity).toBe(2);
        expect(t.subtotalCents).toBe(6_300);
        expect(t.feeTotalCents).toBe(252);
        expect(t.totalCents).toBe(6_552); // (3150+126)*2
        // clamp quantità oltre il massimo
        expect(orderTotalCents(2_400, 9).quantity).toBe(MAX_PER_ORDER);
    });
});
