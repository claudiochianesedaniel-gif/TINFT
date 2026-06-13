import Fastify, {type FastifyInstance} from "fastify";
import {DomainError} from "../domain/models";
import {MemoryStore} from "../repo/memory";
import {TicketingService} from "../services/ticketing";
import {FakeProvider, type PaymentProvider} from "../payments/provider";
import {PaymentsService} from "../payments/service";
import {FakeChain} from "../chain/fake";
import type {ChainPort} from "../chain/port";
import {ViemChain} from "../chain/viem";
import {FakeSpid, type IdentityVerifier} from "../identity/verifier";

/** Usa l'adapter on-chain reale (viem) se le variabili d'ambiente sono presenti, altrimenti il fake. */
function chainFromEnv(): ChainPort | undefined {
  const rpcUrl = process.env.CHAIN_RPC_URL;
  const privateKey = process.env.CHAIN_PRIVATE_KEY;
  const ticketAddress = process.env.TICKET_ADDRESS;
  if (rpcUrl && privateKey && ticketAddress) {
    return new ViemChain({
      rpcUrl,
      privateKey: privateKey as `0x${string}`,
      ticketAddress: ticketAddress as `0x${string}`
    });
  }
  return undefined;
}

/**
 * Costruisce l'app HTTP (Fastify) sopra a TicketingService + PaymentsService
 * (store condiviso). Testabile via `app.inject` senza rete né DB.
 */
export function buildServer(
  opts: {store?: MemoryStore; provider?: PaymentProvider; chain?: ChainPort; verifier?: IdentityVerifier} = {}
): FastifyInstance {
  const store = opts.store ?? new MemoryStore();
  const ticketing = new TicketingService(store);
  const chain = opts.chain ?? chainFromEnv() ?? new FakeChain();
  const verifier = opts.verifier ?? new FakeSpid();
  const payments = new PaymentsService(store, ticketing, opts.provider ?? new FakeProvider(), chain);

  const app = Fastify({logger: false});

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.status(err.status).send({error: err.code, message: err.message});
    }
    return reply.status(500).send({error: "INTERNAL", message: err.message});
  });

  app.get("/health", async () => ({status: "ok"}));

  // -------- account
  app.post<{
    Body: {
      role?: "CLIENTE" | "ORGANIZER" | "VALIDATOR" | "PLATFORM";
      nome: string;
      cognome: string;
      email: string;
      cfHash?: string;
      walletAddress?: string;
    };
  }>("/accounts", async (req, reply) => reply.status(201).send(ticketing.createAccount(req.body)));

  // -------- identità SPID (M8): verifica → lega hash(CF) al wallet
  app.post<{Body: {accountId: string; cf: string; salt?: string}}>("/identity/spid/verify", async (req) => {
    const identity = verifier.verify({cf: req.body.cf, salt: req.body.salt});
    return ticketing.verifyIdentity(req.body.accountId, identity.cfHash);
  });

  // -------- eventi
  app.post<{Body: {organizerId: string; title: string; venue: string; date: string; priceCents: number; capacity: number}}>(
    "/events",
    async (req, reply) => reply.status(201).send(ticketing.createEvent(req.body))
  );
  app.get("/events", async () => ticketing.listEvents());
  app.get<{Params: {id: string}}>("/events/:id", async (req) => ticketing.getEvent(req.params.id));

  // -------- acquisto primario (record diretto; il flusso reale passa dai pagamenti)
  app.post<{Params: {id: string}; Body: {buyerId: string; holderName?: string}}>(
    "/events/:id/purchase",
    async (req, reply) =>
      reply.status(201).send(ticketing.purchasePrimary(req.params.id, req.body.buyerId, {holderName: req.body.holderName}))
  );

  // -------- biglietti
  app.get<{Params: {id: string}}>("/accounts/:id/tickets", async (req) => ticketing.ticketsOf(req.params.id));

  app.post<{
    Params: {id: string};
    Body: {fromId: string; mode: "GIFT" | "PAYMENT"; toId?: string; priceCents?: number; ttlSeconds?: number};
  }>("/tickets/:id/transfers", async (req, reply) => {
    const {fromId, ...rest} = req.body;
    return reply.status(201).send(ticketing.createTransfer(req.params.id, fromId, rest));
  });

  app.post<{Params: {id: string}; Body: {toId: string; holderName?: string}}>(
    "/transfers/:id/accept",
    async (req) => ticketing.acceptTransfer(req.params.id, req.body.toId, req.body.holderName)
  );
  app.post<{Params: {id: string}; Body: {byId?: string}}>(
    "/transfers/:id/reclaim",
    async (req) => ticketing.reclaimTransfer(req.params.id, req.body?.byId)
  );

  app.post<{Params: {id: string}; Body: {validatorId?: string; scenario?: "screenshot"}}>(
    "/tickets/:id/validate",
    async (req) => ticketing.validate(req.params.id, req.body?.validatorId, req.body?.scenario)
  );
  app.post<{Params: {id: string}; Body: {ownerId: string; mode: "FREE" | "ENFORCED"}}>(
    "/tickets/:id/export",
    async (req) => ticketing.exportTicket(req.params.id, req.body.ownerId, req.body.mode)
  );

  // -------- pagamenti (M7)
  app.post<{Body: {eventId: string; buyerId: string}}>(
    "/payments/primary/checkout",
    async (req, reply) => reply.status(201).send(payments.createPrimaryCheckout(req.body.eventId, req.body.buyerId))
  );
  app.post("/webhooks/psp", async (req) => {
    const signature = req.headers["x-psp-signature"];
    return payments.ingestWebhook(JSON.stringify(req.body), typeof signature === "string" ? signature : undefined);
  });

  return app;
}
