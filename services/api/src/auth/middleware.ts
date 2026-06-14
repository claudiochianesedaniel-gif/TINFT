import type {FastifyReply, FastifyRequest, preHandlerHookHandler} from "fastify";
import {type AccountRole, DomainError} from "../domain/models";
import {verifyToken} from "./tokens";

/** Identità autenticata legata alla richiesta (derivata dal token Bearer). */
export interface AuthUser {
  accountId: string;
  role: AccountRole;
}

// Estende il tipo della richiesta Fastify con l'utente autenticato.
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/** Estrae il token Bearer dall'header Authorization (case-insensitive sullo schema). */
export function bearerToken(req: FastifyRequest): string | undefined {
  return bearer(req);
}

function bearer(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !value) return undefined;
  return value.trim();
}

/**
 * preHandler che richiede un token Bearer valido: imposta `req.user` con
 * `{accountId, role}`. 401 se mancante/non valido/scaduto.
 */
export const authenticate: preHandlerHookHandler = async (req: FastifyRequest, _reply: FastifyReply) => {
  const payload = verifyToken(bearer(req)); // lancia DomainError 401 se non valido
  req.user = {accountId: payload.accountId, role: payload.role};
};

/**
 * preHandler che richiede uno dei ruoli indicati (oltre all'autenticazione).
 * 401 se non autenticato, 403 se il ruolo non è ammesso.
 */
export function requireRole(...roles: AccountRole[]): preHandlerHookHandler {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.user) {
      const payload = verifyToken(bearer(req));
      req.user = {accountId: payload.accountId, role: payload.role};
    }
    if (!roles.includes(req.user.role)) {
      throw new DomainError("FORBIDDEN", "ruolo non autorizzato", 403);
    }
  };
}
