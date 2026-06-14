import Fastify, {type FastifyInstance, type preHandlerHookHandler} from "fastify";
import fastifyCors from "@fastify/cors";
import {DomainError} from "../domain/models";
import {MemoryStore} from "../repo/memory";
import type {Store} from "../repo/store";
import {TicketingService} from "../services/ticketing";
import {ContentService} from "../services/content";
import {ConsoleService} from "../services/console";
import {FakeProvider, type PaymentProvider} from "../payments/provider";
import {StripeProvider} from "../payments/stripe";
import {PaymentsService} from "../payments/service";
import {FakeChain} from "../chain/fake";
import type {ChainPort} from "../chain/port";
import {ViemChain} from "../chain/viem";
import {FakeSpid, type IdentityVerifier} from "../identity/verifier";
import {setPassword, verifyPassword} from "../auth/password";
import {signToken, verifyToken} from "../auth/tokens";
import {authenticate, bearerToken as authHeaderToken, requireRole} from "../auth/middleware";
import {readFile} from "node:fs/promises";
import {extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";

// Frontend statici (sito, web app, console, registrazione, demo + assets). Override con WEB_DIR.
const WEB_DIR = process.env.WEB_DIR ?? fileURLToPath(new URL("../../../../apps/web", import.meta.url));
const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

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

/** Usa l'adapter Stripe reale se le chiavi sono presenti, altrimenti il fake. */
function providerFromEnv(): PaymentProvider | undefined {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (key && webhookSecret) return new StripeProvider(key, webhookSecret);
  return undefined;
}

/**
 * Costruisce l'app HTTP (Fastify) sopra a TicketingService + PaymentsService
 * (store condiviso). Testabile via `app.inject` senza rete né DB.
 */
export function buildServer(
  opts: {store?: Store; provider?: PaymentProvider; chain?: ChainPort; verifier?: IdentityVerifier; rateLimit?: boolean} = {}
): FastifyInstance {
  const store: Store = opts.store ?? new MemoryStore();
  const chain = opts.chain ?? chainFromEnv() ?? new FakeChain();
  const verifier = opts.verifier ?? new FakeSpid();
  // Stessa istanza `chain` passata a ticketing e payments: l'acquisto primario/ordini
  // conia via TicketingService, il flusso PSP via PaymentsService (entrambi on-chain con ViemChain).
  const ticketing = new TicketingService(store, undefined, verifier, chain);
  const content = new ContentService(store);
  const consoleSvc = new ConsoleService(store);
  const payments = new PaymentsService(store, ticketing, opts.provider ?? providerFromEnv() ?? new FakeProvider(), chain);

  const app = Fastify({logger: false, bodyLimit: 262_144}); // body max 256 KB
  app.register(fastifyCors, {origin: true}); // consumo dal frontend (webapp/sito)

  // Security header di base su ogni risposta (no CSP stretta: le pagine servite usano script inline + Google Fonts).
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-DNS-Prefetch-Control", "off");
    return payload;
  });

  // Rate limiting in-memory (per istanza) sulle route sensibili (anti brute-force).
  // Disattivo sotto test (VITEST) salvo override esplicito via opts.rateLimit.
  const rlEnabled = opts.rateLimit ?? !process.env.VITEST;
  const rlHits = new Map<string, {count: number; reset: number}>();
  function rateLimit(max: number, windowMs: number): preHandlerHookHandler {
    return async (req, reply) => {
      if (!rlEnabled) return;
      const key = `${req.ip}|${req.url.split("?")[0]}`;
      const now = Date.now();
      const e = rlHits.get(key);
      if (!e || now > e.reset) {
        rlHits.set(key, {count: 1, reset: now + windowMs});
        return;
      }
      e.count += 1;
      if (e.count > max) {
        reply.header("Retry-After", Math.ceil((e.reset - now) / 1000));
        throw new DomainError("RATE_LIMITED", "troppe richieste, riprova tra poco", 429);
      }
    };
  }

  // cattura il raw body (per la verifica firma webhook Stripe) mantenendo il JSON parsato
  app.addContentTypeParser("application/json", {parseAs: "string"}, (req, payload, done) => {
    const raw = payload as unknown as string;
    (req as unknown as {rawBody?: string}).rawBody = raw;
    try {
      done(null, raw && raw.length ? JSON.parse(raw) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.status(err.status).send({error: err.code, message: err.message});
    }
    return reply.status(500).send({error: "INTERNAL", message: err.message});
  });

  // Fallback statico: le richieste GET non gestite dall'API servono i frontend da WEB_DIR
  // (così un solo server espone API + Sito/Web App/Console). Path-traversal bloccato.
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method === "GET" || req.method === "HEAD") {
      let urlPath = req.url.split("?")[0] || "/";
      if (urlPath === "/") urlPath = "/index.html";
      const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[\\/])+/, "").replace(/^[\\/]+/, "");
      const filePath = join(WEB_DIR, rel);
      if (filePath.startsWith(WEB_DIR)) {
        try {
          const data = await readFile(filePath);
          return reply.header("content-type", STATIC_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream").send(data);
        } catch {
          /* non è un file statico → 404 JSON sotto */
        }
      }
    }
    return reply.status(404).send({error: "NOT_FOUND", message: `risorsa non trovata: ${req.method} ${req.url}`});
  });

  /**
   * Guardia di "ownership" al bordo: l'id (in body o path) deve coincidere con
   * `req.user.accountId`, salvo il ruolo PLATFORM (operatore). 403 altrimenti.
   * Il service layer verifica già la proprietà delle risorse: questo lega l'identità.
   */
  function assertSelf(req: {user?: {accountId: string; role: string}}, id: string | undefined): void {
    const user = req.user;
    if (!user) throw new DomainError("BAD_TOKEN", "token mancante", 401);
    if (user.role === "PLATFORM") return; // l'operatore di piattaforma può agire per conto altrui
    if (id !== undefined && id !== user.accountId) {
      throw new DomainError("FORBIDDEN", "non puoi operare per conto di un altro account", 403);
    }
  }

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
      password?: string;
    };
  }>("/accounts", async (req, reply) => {
    const {password, ...rest} = req.body;
    const account = await ticketing.createAccount(rest);
    if (password) {
      setPassword(account, password);
      await store.updateAccount(account);
    }
    return reply.status(201).send(account);
  });

  // -------- registrazione completa con dati SPID → identità verificata (hash CF on-chain)
  app.post<{
    Body: {
      nome: string;
      cognome: string;
      email: string;
      cf: string;
      dateOfBirth?: string;
      placeOfBirth?: string;
      gender?: string;
      address?: string;
      city?: string;
      zip?: string;
      province?: string;
      phone?: string;
      password?: string;
    };
  }>("/register", async (req, reply) => {
    const b = req.body;
    const id = verifier.verify({cf: b.cf, nome: b.nome, cognome: b.cognome});
    const account = await ticketing.createAccount({
      role: "CLIENTE",
      nome: b.nome,
      cognome: b.cognome,
      email: b.email,
      cf: b.cf,
      cfHash: id.cfHash,
      dateOfBirth: b.dateOfBirth,
      placeOfBirth: b.placeOfBirth,
      gender: b.gender,
      address: b.address,
      city: b.city,
      zip: b.zip,
      province: b.province,
      phone: b.phone
    });
    if (b.password) {
      setPassword(account, b.password);
      await store.updateAccount(account);
    }
    return reply.status(201).send(account);
  });

  // -------- registrazione via email + OTP (v2)
  app.post<{
    Body: {
      nome: string;
      cognome: string;
      cf: string;
      email: string;
      dateOfBirth?: string;
      placeOfBirth?: string;
      gender?: string;
      address?: string;
      city?: string;
      zip?: string;
      province?: string;
      phone?: string;
      username?: string;
      password?: string;
    };
  }>("/auth/register/email", {preHandler: rateLimit(30, 60_000)}, async (req, reply) => reply.status(201).send(await ticketing.startEmailRegistration(req.body)));

  app.post<{Body: {email: string; code: string}}>("/auth/register/email/verify", async (req, reply) =>
    reply.status(201).send(await ticketing.verifyEmailRegistration(req.body.email, req.body.code))
  );

  // -------- login: email + password → token + account
  app.post<{Body: {email: string; password: string}}>("/auth/login", {preHandler: rateLimit(30, 60_000)}, async (req, reply) => {
    const account = await ticketing.findAccountByEmail(req.body.email ?? "");
    if (!account || !verifyPassword(account, req.body.password ?? "")) {
      throw new DomainError("BAD_CREDENTIALS", "credenziali non valide", 401);
    }
    const token = signToken({accountId: account.id, role: account.role});
    return reply.status(200).send({token, account});
  });

  // GDPR — cancellazione account (right to erasure). Gating admin via token;
  // in produzione: auth reale + allow-list (cfr. pattern Mindful Trading Club).
  const adminToken = process.env.ADMIN_TOKEN ?? "dev-admin";
  app.delete<{Params: {id: string}}>("/accounts/:id", async (req, reply) => {
    if (req.headers["x-admin-token"] !== adminToken) {
      return reply.status(403).send({error: "FORBIDDEN", message: "richiede token admin"});
    }
    return ticketing.deleteAccount(req.params.id);
  });

  // -------- identità SPID (M8): verifica → lega hash(CF) al wallet
  app.post<{Body: {accountId: string; cf: string; salt?: string}}>("/identity/spid/verify", async (req) => {
    const identity = verifier.verify({cf: req.body.cf, salt: req.body.salt});
    return ticketing.verifyIdentity(req.body.accountId, identity.cfHash);
  }); // deleteAccount/verifyIdentity restituiscono Promise → Fastify le risolve

  // -------- club & eventi del club (M9)
  app.post<{
    Body: {
      organizerId: string;
      name: string;
      city?: string;
      fidelityPriceCents?: number;
      fidelityUses?: number;
      ragioneSociale?: string;
      piva?: string;
      sedeLegale?: string;
      pec?: string;
      sdi?: string;
      iban?: string;
      genre?: string;
      color?: string;
    };
  }>("/clubs", {preHandler: requireRole("ORGANIZER", "PLATFORM")}, async (req, reply) => {
    assertSelf(req, req.body.organizerId);
    return reply.status(201).send(await ticketing.createClub(req.body));
  });
  app.get("/clubs", async () => ticketing.listClubs());
  app.get<{Params: {id: string}}>("/clubs/:id", async (req) => ticketing.getClub(req.params.id));
  app.get<{Params: {id: string}}>("/clubs/:id/events", async (req) => {
    await ticketing.getClub(req.params.id);
    return ticketing.clubEvents(req.params.id);
  });
  app.post<{
    Params: {id: string};
    Body: {organizerId: string; title: string; venue: string; date: string; priceCents: number; capacity: number};
  }>("/clubs/:id/events", {preHandler: requireRole("ORGANIZER", "PLATFORM")}, async (req, reply) => {
    assertSelf(req, req.body.organizerId);
    await ticketing.getClub(req.params.id);
    return reply.status(201).send(await ticketing.createEvent({...req.body, clubId: req.params.id}));
  });
  app.post<{Params: {id: string}; Body: {buyerId: string}}>(
    "/clubs/:id/fidelity",
    {preHandler: authenticate},
    async (req, reply) => {
      assertSelf(req, req.body.buyerId);
      return reply.status(201).send(await ticketing.purchaseFidelity(req.params.id, req.body.buyerId));
    }
  );

  // -------- eventi
  app.post<{
    Body: {
      organizerId: string;
      title: string;
      venue: string;
      date: string;
      priceCents: number;
      capacity: number;
      status?: "DRAFT" | "ON_SALE" | "CONCLUDED";
    };
  }>("/events", {preHandler: requireRole("ORGANIZER", "PLATFORM")}, async (req, reply) => {
    assertSelf(req, req.body.organizerId);
    return reply.status(201).send(await ticketing.createEvent(req.body));
  });
  app.get("/events", async () => ticketing.listEvents());
  app.get<{Params: {id: string}}>("/events/:id", async (req) => ticketing.getEvent(req.params.id));

  // -------- acquisto primario (record diretto; il flusso reale passa dai pagamenti)
  app.post<{Params: {id: string}; Body: {buyerId: string; holderName?: string}}>(
    "/events/:id/purchase",
    async (req, reply) =>
      reply.status(201).send(await ticketing.purchasePrimary(req.params.id, req.body.buyerId, {holderName: req.body.holderName}))
  );

  // -------- fasce di prezzo (tier) (v2)
  app.get<{Params: {id: string}}>("/events/:id/tiers", async (req) => ticketing.listTiers(req.params.id));
  app.post<{Params: {id: string}; Body: {organizerId: string; name: string; priceCents: number; note?: string}}>(
    "/events/:id/tiers",
    {preHandler: requireRole("ORGANIZER", "PLATFORM")},
    async (req, reply) => {
      assertSelf(req, req.body.organizerId);
      return reply.status(201).send(await ticketing.createTier(req.params.id, req.body));
    }
  );

  // -------- ordini / checkout v2 (commissione 4% + quantità + limite 2)
  app.post<{Body: {buyerId: string; eventId: string; tierId?: string; quantity: number}}>(
    "/orders",
    {preHandler: authenticate},
    async (req, reply) => {
      assertSelf(req, req.body.buyerId);
      return reply.status(201).send(await ticketing.createOrder(req.body));
    }
  );
  app.post<{Params: {id: string}; Body: Record<string, never>}>(
    "/orders/:id/pay",
    {preHandler: authenticate},
    async (req) => {
      const order = await ticketing.getOrder(req.params.id);
      assertSelf(req, order.buyerId);
      return ticketing.payOrder(req.params.id);
    }
  );
  // Checkout PSP reale (Stripe se configurato, altrimenti FakeProvider): apre la sessione di
  // pagamento; al webhook "succeeded" (/webhooks/psp) l'ordine viene pagato e i biglietti coniati.
  app.post<{Params: {id: string}; Body: Record<string, never>}>(
    "/orders/:id/checkout",
    {preHandler: authenticate},
    async (req, reply) => {
      const order = await ticketing.getOrder(req.params.id);
      assertSelf(req, order.buyerId);
      return reply.status(201).send(await payments.createOrderCheckout(req.params.id));
    }
  );
  app.get<{Params: {id: string}}>("/orders/:id", {preHandler: authenticate}, async (req) => {
    const order = await ticketing.getOrder(req.params.id);
    assertSelf(req, order.buyerId);
    return order;
  });
  app.get<{Params: {id: string}}>("/accounts/:id/orders", {preHandler: authenticate}, async (req) => {
    assertSelf(req, req.params.id);
    return ticketing.ordersOf(req.params.id);
  });

  // -------- mercato secondario (rivendita) (v2)
  app.get("/market", async () => ticketing.market());
  app.post<{Params: {ticketId: string}; Body: {buyerId: string}}>(
    "/market/:ticketId/buy",
    {preHandler: authenticate},
    async (req) => {
      assertSelf(req, req.body.buyerId);
      return ticketing.buyFromMarket(req.params.ticketId, req.body.buyerId);
    }
  );

  // -------- biglietti
  app.get<{Params: {id: string}}>("/accounts/:id/tickets", {preHandler: authenticate}, async (req) => {
    assertSelf(req, req.params.id);
    return ticketing.ticketsOf(req.params.id);
  });

  app.post<{Params: {id: string}; Body: {ownerId: string; priceCents: number}}>(
    "/tickets/:id/list",
    {preHandler: authenticate},
    async (req, reply) => {
      assertSelf(req, req.body.ownerId);
      return reply.status(201).send(await ticketing.listTicket(req.params.id, req.body.ownerId, req.body.priceCents));
    }
  );
  app.post<{Params: {id: string}; Body: {ownerId: string}}>(
    "/tickets/:id/unlist",
    {preHandler: authenticate},
    async (req) => {
      assertSelf(req, req.body.ownerId);
      return ticketing.unlistTicket(req.params.id, req.body.ownerId);
    }
  );

  app.post<{
    Params: {id: string};
    Body: {fromId: string; mode: "GIFT" | "PAYMENT"; toId?: string; priceCents?: number; ttlSeconds?: number};
  }>("/tickets/:id/transfers", {preHandler: authenticate}, async (req, reply) => {
    const {fromId, ...rest} = req.body;
    assertSelf(req, fromId);
    return reply.status(201).send(await ticketing.createTransfer(req.params.id, fromId, rest));
  });

  app.post<{Params: {id: string}; Body: {toId: string; holderName?: string}}>(
    "/transfers/:id/accept",
    {preHandler: authenticate},
    async (req) => {
      assertSelf(req, req.body.toId);
      return ticketing.acceptTransfer(req.params.id, req.body.toId, req.body.holderName);
    }
  );
  app.post<{Params: {id: string}; Body: {byId?: string}}>(
    "/transfers/:id/reclaim",
    {preHandler: authenticate},
    async (req) => {
      assertSelf(req, req.body?.byId);
      return ticketing.reclaimTransfer(req.params.id, req.body?.byId);
    }
  );

  app.post<{Params: {id: string}; Body: {validatorId?: string; scenario?: "screenshot"}}>(
    "/tickets/:id/validate",
    {preHandler: authenticate},
    async (req) => ticketing.validate(req.params.id, req.body?.validatorId, req.body?.scenario)
  );
  app.post<{Params: {id: string}; Body: {ownerId: string; mode: "FREE" | "ENFORCED"}}>(
    "/tickets/:id/export",
    {preHandler: authenticate},
    async (req) => {
      assertSelf(req, req.body.ownerId);
      return ticketing.exportTicket(req.params.id, req.body.ownerId, req.body.mode);
    }
  );

  // -------- contenuti editoriali (B5): artisti, blog, news
  app.get("/artists", async () => content.listArtists());
  app.post<{Params: {id: string}}>(
    "/artists/:id/follow",
    {preHandler: authenticate},
    async (req) => content.followArtist(req.params.id)
  );
  app.get("/blog", async () => content.listBlog());
  app.get<{Params: {slug: string}}>("/blog/:slug", async (req) => content.getBlogBySlug(req.params.slug));
  app.get("/news", async () => content.listNews());

  // -------- console organizzatore (B6): dashboard, incassi, accessi, varchi
  app.get<{Params: {id: string}}>(
    "/organizers/:id/dashboard",
    {preHandler: requireRole("ORGANIZER", "PLATFORM")},
    async (req) => {
      assertSelf(req, req.params.id);
      return consoleSvc.dashboard(req.params.id);
    }
  );
  app.get<{Params: {id: string}}>(
    "/organizers/:id/incassi",
    {preHandler: requireRole("ORGANIZER", "PLATFORM")},
    async (req) => {
      assertSelf(req, req.params.id);
      return consoleSvc.incassi(req.params.id);
    }
  );
  app.get<{Params: {id: string}}>(
    "/events/:id/accessi",
    {preHandler: requireRole("ORGANIZER", "PLATFORM")},
    async (req) => {
      assertSelf(req, (await ticketing.getEvent(req.params.id)).organizerId);
      return consoleSvc.eventAccess(req.params.id);
    }
  );

  app.get<{Params: {id: string}}>(
    "/events/:id/validators",
    {preHandler: requireRole("ORGANIZER", "PLATFORM")},
    async (req) => {
      assertSelf(req, (await ticketing.getEvent(req.params.id)).organizerId);
      return ticketing.listValidators(req.params.id);
    }
  );
  app.post<{Params: {id: string}; Body: {organizerId: string}}>(
    "/events/:id/validators",
    {preHandler: requireRole("ORGANIZER", "PLATFORM")},
    async (req, reply) => {
      assertSelf(req, req.body.organizerId);
      return reply.status(201).send(await ticketing.createValidator(req.params.id, req.body.organizerId));
    }
  );

  // -------- console piattaforma (B6): ricavi dal ledger + GMV + conteggio P2P.
  // Richiede ruolo PLATFORM (via token) oppure il token admin (x-admin-token).
  app.get(
    "/platform/revenue",
    {
      preHandler: (req, _reply, done) => {
        if (req.headers["x-admin-token"] === adminToken) {
          req.user = {accountId: "admin", role: "PLATFORM"};
          return done();
        }
        try {
          const payload = verifyToken(authHeaderToken(req));
          if (payload.role !== "PLATFORM") throw new DomainError("FORBIDDEN", "ruolo non autorizzato", 403);
          req.user = {accountId: payload.accountId, role: payload.role};
          done();
        } catch (err) {
          done(err as Error);
        }
      }
    },
    async () => consoleSvc.platformRevenue()
  );

  // -------- KYC organizzatore (B7): submit (org, autenticato-self) + decision (admin)
  app.post<{Params: {id: string}}>(
    "/organizers/:id/kyc/submit",
    {preHandler: authenticate},
    async (req) => {
      assertSelf(req, req.params.id);
      return ticketing.submitKyc(req.params.id);
    }
  );
  app.post<{Params: {id: string}; Body: {decision: "VERIFIED" | "REJECTED"}}>(
    "/organizers/:id/kyc/decision",
    async (req, reply) => {
      if (req.headers["x-admin-token"] !== adminToken) {
        return reply.status(403).send({error: "FORBIDDEN", message: "richiede token admin"});
      }
      return ticketing.decideKyc(req.params.id, req.body.decision);
    }
  );

  // -------- pubblicazione evento con gate KYC (B7): DRAFT → ON_SALE
  app.post<{Params: {id: string}; Body: {organizerId: string}}>(
    "/events/:id/publish",
    {preHandler: requireRole("ORGANIZER", "PLATFORM")},
    async (req) => {
      assertSelf(req, req.body.organizerId);
      return ticketing.publishEvent(req.params.id, req.body.organizerId);
    }
  );

  // -------- pagamenti (M7)
  app.post<{Body: {eventId: string; buyerId: string}}>(
    "/payments/primary/checkout",
    async (req, reply) => reply.status(201).send(await payments.createPrimaryCheckout(req.body.eventId, req.body.buyerId))
  );
  app.post("/webhooks/psp", async (req) => {
    const sig = req.headers["stripe-signature"] ?? req.headers["x-psp-signature"];
    const raw = (req as unknown as {rawBody?: string}).rawBody ?? JSON.stringify(req.body);
    return payments.ingestWebhook(raw, typeof sig === "string" ? sig : undefined);
  });

  return app;
}
