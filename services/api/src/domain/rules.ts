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
export const RESALE_CAP_BPS = 11_000; // tetto +10% sul costo base (R2)
export const EXIT_FEE_BPS = 2_500; // fee d'uscita export libero 25% (R5)
export const MAX_PER_EVENT = 3; // max biglietti per evento per identità (R4)
export const PRESALE_COMMISSION_BPS = 1_000; // commissione di prevendita 10% sul PRIMO acquisto, solo TINFT, a carico del compratore (R10)
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

/** Prezzo massimo di rivendita = costo base · 1,10 (troncato). */
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

/** Si può acquisire un altro biglietto per l'evento se se ne controllano meno di 3. */
export function canAcquireForEvent(currentHeld: number): boolean {
  return currentHeld < MAX_PER_EVENT;
}

/**
 * Commissione di PREVENDITA (10%) sul PRIMO acquisto (primario), per biglietto.
 * Va SOLO a TINFT, è OFF-CHAIN (fee di piattaforma), a carico del compratore e sommata
 * al prezzo. NON si applica alla rivendita: sul secondario c'è solo la royalty 1%
 * (0,5% TINFT + 0,5% organizzatore). Arrotondamento commerciale (round).
 */
export function presaleCommissionCents(priceCents: number): number {
  return Math.round((priceCents * PRESALE_COMMISSION_BPS) / BPS_DENOMINATOR);
}

export interface OrderTotal {
  unitPriceCents: number;
  presaleCommissionCents: number; // commissione di prevendita per biglietto
  quantity: number;
  subtotalCents: number; // prezzo × qty
  feeTotalCents: number; // commissione di prevendita × qty
  totalCents: number; // (prezzo + commissione) × qty
}

/** Quantità valida per un singolo checkout: clamp 1..MAX_PER_ORDER. */
export function clampOrderQuantity(quantity: number): number {
  const q = Math.floor(quantity) || 1;
  return Math.max(1, Math.min(MAX_PER_ORDER, q));
}

// ---------------------------------------------------------------------------
// Codice varco (gateCode) — non economico ma regola di dominio: ogni evento ha
// un codice unico con cui lo staff si aggancia al SOLO suo varco (niente picker).
// ---------------------------------------------------------------------------

/** Alfabeto senza caratteri ambigui (niente 0/O, 1/I/L) per codici leggibili a voce. */
const GATE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const GATE_CODE_SUFFIX_LENGTH = 4;

/** Normalizza un codice varco per confronto/persistenza: trim, maiuscole, niente spazi interni. */
export function normalizeGateCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Genera un codice varco leggibile dal titolo dell'evento: prefisso di max 5
 * lettere/cifre del titolo (fallback "VARCO") + 4 caratteri casuali non ambigui,
 * es. "Notte Elettronica" → "NOTTE-7K2M". L'unicità è garantita dal chiamante
 * (retry sul lookup) e dal vincolo unique in persistenza.
 */
export function generateGateCode(title: string, random: () => number = Math.random): string {
  const prefix = title
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5) || "VARCO";
  let suffix = "";
  for (let i = 0; i < GATE_CODE_SUFFIX_LENGTH; i++) {
    suffix += GATE_CODE_ALPHABET[Math.floor(random() * GATE_CODE_ALPHABET.length)];
  }
  return `${prefix}-${suffix}`;
}

/** Totale checkout primario: (prezzo + commissione di prevendita 10%) × quantità. */
export function orderTotalCents(priceCents: number, quantity: number): OrderTotal {
  const q = clampOrderQuantity(quantity);
  const fee = presaleCommissionCents(priceCents);
  return {
    unitPriceCents: priceCents,
    presaleCommissionCents: fee,
    quantity: q,
    subtotalCents: priceCents * q,
    feeTotalCents: fee * q,
    totalCents: (priceCents + fee) * q
  };
}
