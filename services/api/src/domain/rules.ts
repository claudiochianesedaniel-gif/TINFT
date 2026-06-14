/**
 * Regole economiche TINFT — sorgente UNICA condivisa con i contratti on-chain.
 *
 * Tutti gli importi sono in CENTESIMI di euro (interi), per riprodurre fedelmente
 * la matematica intera on-chain (niente float, stessi arrotondamenti per troncamento).
 * I valori devono restare allineati a `contracts/src/TinftTicket.sol` e
 * `TinftEscrow.sol` (cfr. docs/SPEC-VERIFICATA.md, regole R1–R6).
 */

export const BPS_DENOMINATOR = 10_000;
export const ROYALTY_BPS = 100; // 1% del prezzo originale (R1)
export const RESALE_CAP_BPS = 10_500; // tetto +5% sul costo base (R2)
export const EXIT_FEE_BPS = 2_500; // fee d'uscita export libero 25% (R5)
export const MAX_PER_EVENT = 2; // max biglietti per evento per identità (R4)
export const SERVICE_FEE_BPS = 400; // commissione servizio 4% sul primario, a carico del compratore (R10)
export const MAX_PER_ORDER = 4; // tetto quantità per singolo checkout (distinto da MAX_PER_EVENT)
export const GOODWILL_PER_TICKET = 15; // punti goodwill accreditati per biglietto acquistato
export const ESCROW_TTL_DEFAULT_SECONDS = 600; // TTL escrow predefinito (10 min), parametrico per evento

/** Royalty dovuta: 1% del prezzo ORIGINALE (a carico del compratore). */
export function royaltyCents(originalPriceCents: number): number {
  return Math.floor((originalPriceCents * ROYALTY_BPS) / BPS_DENOMINATOR);
}

export interface RoyaltySplit {
  tinftCents: number;
  organizerCents: number;
}

/** Ripartizione 0,5%/0,5%; l'eventuale resto (importo dispari) va all'organizzatore. */
export function royaltySplitCents(originalPriceCents: number): RoyaltySplit {
  const royalty = royaltyCents(originalPriceCents);
  const tinftCents = Math.floor(royalty / 2);
  return { tinftCents, organizerCents: royalty - tinftCents };
}

/** Prezzo massimo di rivendita = costo base · 1,05 (troncato). */
export function resaleCapCents(paidCents: number): number {
  return Math.floor((paidCents * RESALE_CAP_BPS) / BPS_DENOMINATOR);
}

export function isResalePriceAllowed(priceCents: number, paidCents: number): boolean {
  return priceCents <= resaleCapCents(paidCents);
}

/** Fee d'uscita per l'export libero: 25% del prezzo originale. */
export function exitFeeCents(originalPriceCents: number): number {
  return Math.floor((originalPriceCents * EXIT_FEE_BPS) / BPS_DENOMINATOR);
}

/** Si può acquisire un altro biglietto per l'evento se se ne controllano meno di 2. */
export function canAcquireForEvent(currentHeld: number): boolean {
  return currentHeld < MAX_PER_EVENT;
}

/**
 * Commissione servizio (4%) sul primario, per biglietto. È OFF-CHAIN (fee PSP/piattaforma),
 * a carico del compratore e sommata al prezzo. Arrotondamento commerciale (round).
 */
export function serviceFeeCents(priceCents: number): number {
  return Math.round((priceCents * SERVICE_FEE_BPS) / BPS_DENOMINATOR);
}

export interface OrderTotal {
  unitPriceCents: number;
  serviceFeeCents: number; // per biglietto
  quantity: number;
  subtotalCents: number; // prezzo × qty
  feeTotalCents: number; // commissione × qty
  totalCents: number; // (prezzo + commissione) × qty
}

/** Quantità valida per un singolo checkout: clamp 1..MAX_PER_ORDER. */
export function clampOrderQuantity(quantity: number): number {
  const q = Math.floor(quantity) || 1;
  return Math.max(1, Math.min(MAX_PER_ORDER, q));
}

/** Totale checkout primario: (prezzo + commissione servizio) × quantità. */
export function orderTotalCents(priceCents: number, quantity: number): OrderTotal {
  const q = clampOrderQuantity(quantity);
  const fee = serviceFeeCents(priceCents);
  return {
    unitPriceCents: priceCents,
    serviceFeeCents: fee,
    quantity: q,
    subtotalCents: priceCents * q,
    feeTotalCents: fee * q,
    totalCents: (priceCents + fee) * q
  };
}
