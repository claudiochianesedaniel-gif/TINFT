import {createHash} from "node:crypto";
import {DomainError} from "../domain/models";

export interface SpidAssertion {
  cf: string;
  salt?: string;
  nome?: string;
  cognome?: string;
}

export interface VerifiedIdentity {
  cfHash: string; // on-chain finisce solo questo hash, mai il CF in chiaro
  nome?: string;
  cognome?: string;
}

/** Verificatore d'identità (SPID). L'adapter reale usa OIDC via aggregatore accreditato. */
export interface IdentityVerifier {
  verify(assertion: SpidAssertion): VerifiedIdentity;
}

/**
 * Stand-in di SPID per sandbox/test. In produzione: OIDC reale; on-chain solo
 * `keccak256(CF + salt)` — qui sha256 come placeholder deterministico off-chain.
 */
export class FakeSpid implements IdentityVerifier {
  verify(a: SpidAssertion): VerifiedIdentity {
    if (!a.cf || a.cf.trim().length < 6) throw new DomainError("BAD_SPID", "codice fiscale non valido");
    const cfHash = "0x" + createHash("sha256").update(`${a.cf.trim().toUpperCase()}:${a.salt ?? ""}`).digest("hex");
    return {cfHash, nome: a.nome, cognome: a.cognome};
  }
}
