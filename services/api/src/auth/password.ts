import {randomBytes, scryptSync, timingSafeEqual} from "node:crypto";
import {type Account, DomainError} from "../domain/models";

// Lunghezza minima password (demo: i dati di esempio possono usare "1234").
export const MIN_PASSWORD_LENGTH = 4;

const KEYLEN = 64; // byte della derivazione scrypt

/** Deriva l'hash scrypt di una password con un salt dato (hex). */
function deriveHex(plain: string, saltHex: string): string {
  return scryptSync(plain, saltHex, KEYLEN).toString("hex");
}

/**
 * Calcola l'hash di una password nel formato `salt:hash` (hex), con salt casuale.
 * Nessuna dipendenza esterna: solo `node:crypto` (scrypt + randomBytes).
 */
export function hashPassword(plain: string): string {
  if (!plain || plain.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError("WEAK_PASSWORD", `la password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`);
  }
  const saltHex = randomBytes(16).toString("hex");
  return `${saltHex}:${deriveHex(plain, saltHex)}`;
}

/** Verifica una password in chiaro contro un hash `salt:hash` (confronto a tempo costante). */
export function verifyHash(plain: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, saltHex, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Imposta (in-place) la password di un account memorizzandone l'hash scrypt. */
export function setPassword(account: Account, plain: string): Account {
  account.passwordHash = hashPassword(plain);
  return account;
}

/** Verifica la password in chiaro contro l'hash memorizzato sull'account. */
export function verifyPassword(account: Account, plain: string): boolean {
  return verifyHash(plain, account.passwordHash);
}
