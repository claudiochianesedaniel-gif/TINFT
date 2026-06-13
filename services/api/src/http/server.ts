import Fastify, {type FastifyInstance} from "fastify";
import {DomainError} from "../domain/models";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "../services/ticketing";

/**
 * Costruisce l'app HTTP (Fastify) sopra al TicketingService. Testabile via
 * `app.inject` senza rete né DB. Le route mappano i flussi dei 4 profili.
 */
export function buildServer(opts: {service?: TicketingService} = {}): FastifyInstance {
  const service = opts.service ?? new TicketingService(new MemoryStore());
  const app = Fastify({logger: false});

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.status(err.status).send({error: err.code, message: err.message});
    }
    return reply.status(500).send({error: "INTERNAL", message: err.message});
  });

  app.get("/health", async () => ({status: "ok"}));

  app.post<{
    Body: {
      role?: "CLIENTE" | "ORGANIZER" | "VALIDATOR" | "PLATFORM";
      nome: string;
      cognome: string;
      email: string;
      cfHash?: string;
      walletAddress?: string;
    };
  }>("/accounts", async (req, reply) => reply.status(201).send(service.createAccount(req.body)));

  app.post<{Body: {organizerId: string; title: string; venue: string; date: string; priceCents: number; capacity: number}}>(
    "/events",
    async (req, reply) => reply.status(201).send(service.createEvent(req.body))
  );

  app.get("/events", async () => service.listEvents());
  app.get<{Params: {id: string}}>("/events/:id", async (req) => service.getEvent(req.params.id));

  app.post<{Params: {id: string}; Body: {buyerId: string; holderName?: string}}>(
    "/events/:id/purchase",
    async (req, reply) => reply.status(201).send(service.purchasePrimary(req.params.id, req.body.buyerId, req.body.holderName))
  );

  app.get<{Params: {id: string}}>("/accounts/:id/tickets", async (req) => service.ticketsOf(req.params.id));

  app.post<{
    Params: {id: string};
    Body: {fromId: string; mode: "GIFT" | "PAYMENT"; toId?: string; priceCents?: number; ttlSeconds?: number};
  }>("/tickets/:id/transfers", async (req, reply) => {
    const {fromId, ...rest} = req.body;
    return reply.status(201).send(service.createTransfer(req.params.id, fromId, rest));
  });

  app.post<{Params: {id: string}; Body: {toId: string; holderName?: string}}>(
    "/transfers/:id/accept",
    async (req) => service.acceptTransfer(req.params.id, req.body.toId, req.body.holderName)
  );

  app.post<{Params: {id: string}; Body: {byId?: string}}>(
    "/transfers/:id/reclaim",
    async (req) => service.reclaimTransfer(req.params.id, req.body?.byId)
  );

  app.post<{Params: {id: string}; Body: {validatorId?: string; scenario?: "screenshot"}}>(
    "/tickets/:id/validate",
    async (req) => service.validate(req.params.id, req.body?.validatorId, req.body?.scenario)
  );

  app.post<{Params: {id: string}; Body: {ownerId: string; mode: "FREE" | "ENFORCED"}}>(
    "/tickets/:id/export",
    async (req) => service.exportTicket(req.params.id, req.body.ownerId, req.body.mode)
  );

  return app;
}
