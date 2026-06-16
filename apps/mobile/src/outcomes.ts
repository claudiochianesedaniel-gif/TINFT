import {colors} from "./theme";
import type {ValidationOutcome} from "./types";

/**
 * Mappa i 5 esiti di validazione su colore + icona + testo, identici al
 * prototipo (verde ✓ valido / arancio ! screenshot / rosso ✕ duplicato /
 * arancio ⏸ escrow / rosso ✕ falso).
 */
export interface OutcomeTheme {
  color: string;
  /** Colore dell'icona, scelto per contrastare con `color` (sfondo del badge). */
  iconColor: string;
  icon: string;
  title: string;
  subtitle: string;
}

export const OUTCOME_THEME: Record<ValidationOutcome, OutcomeTheme> = {
  VALID: {
    color: colors.green,
    iconColor: colors.onGreen, // verde chiaro → icona scura
    icon: "✓", // ✓
    title: "Accesso valido",
    subtitle: "Ingresso consentito"
  },
  SCREENSHOT: {
    color: colors.orange,
    iconColor: "#3a2400", // arancio → icona scura
    icon: "!",
    title: "Codice non valido",
    subtitle: "QR scaduto: probabile screenshot"
  },
  DUPLICATE: {
    color: colors.red,
    iconColor: colors.text, // rosso → icona bianca
    icon: "✕", // ✕
    title: "Già validato",
    subtitle: "Biglietto già usato per l'ingresso"
  },
  ESCROW: {
    color: colors.orange,
    iconColor: "#3a2400",
    icon: "⏸", // ⏸
    title: "In trasferimento",
    subtitle: "Biglietto in escrow: accesso sospeso"
  },
  FAKE: {
    color: colors.red,
    iconColor: colors.text,
    icon: "✕", // ✕
    title: "Biglietto non valido",
    subtitle: "Firma assente o manomessa"
  }
};

export function outcomeTheme(outcome: ValidationOutcome): OutcomeTheme {
  return OUTCOME_THEME[outcome] ?? OUTCOME_THEME.FAKE;
}
