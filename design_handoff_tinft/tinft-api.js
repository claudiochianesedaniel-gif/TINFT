/*
 * tinft-api.js — wrapper `window.TINFT_API` per collegare il Prototipo App (.dc.html)
 * all'API reale (services/api). Zero dipendenze: usa solo `fetch`.
 *
 * Base URL (in ordine di priorità):
 *   1) window.TINFT_API_BASE  (impostalo prima di caricare questo file)
 *   2) <meta name="tinft-api-base" content="https://...">
 *   3) ?api=... nella query string
 *   4) http://localhost:3001  (default: backend `pnpm dev`)
 *
 * Esempio: <script>window.TINFT_API_BASE='https://tinft-api.onrender.com'</script>
 *          <script src="./tinft-api.js"></script>
 *
 * Ogni metodo che richiede autenticazione riceve il `token` di sessione (da login()).
 * I metodi non lanciano su 4xx/5xx: rilanciano un Error con il messaggio dell'API,
 * così il prototipo può gestire il fallback (try/catch) come già fa.
 */
(function () {
  "use strict";

  function resolveBase() {
    if (typeof window !== "undefined" && window.TINFT_API_BASE) return String(window.TINFT_API_BASE);
    try {
      var meta = document.querySelector('meta[name="tinft-api-base"]');
      if (meta && meta.content) return meta.content;
    } catch (e) {}
    try {
      var q = new URLSearchParams(location.search).get("api");
      if (q) return q;
    } catch (e) {}
    return "http://localhost:3001";
  }

  var BASE = resolveBase().replace(/\/+$/, "");

  /** fetch JSON con Bearer opzionale; lancia Error(message dell'API) su non-2xx. */
  async function req(method, path, opts) {
    opts = opts || {};
    var headers = {"content-type": "application/json"};
    if (opts.token) headers["authorization"] = "Bearer " + opts.token;
    var res;
    try {
      res = await fetch(BASE + path, {
        method: method,
        headers: headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch (netErr) {
      throw new Error("rete non raggiungibile: " + (netErr && netErr.message ? netErr.message : "offline"));
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }
    if (!res.ok) {
      var msg = data && data.message ? data.message : "HTTP " + res.status;
      var err = new Error(msg);
      err.status = res.status;
      err.code = data && data.error ? data.error : undefined;
      throw err;
    }
    return data;
  }

  var API = {
    /** base URL effettivo (utile per debug). */
    baseUrl: function () {
      return BASE;
    },

    /** ping di salute — sveglia l'istanza Render "addormentata" prima dei flussi. */
    warm: function () {
      return req("GET", "/health").catch(function () {
        return {status: "cold"};
      });
    },

    // -------- auth
    login: function (email, password) {
      return req("POST", "/auth/login", {body: {email: email, password: password}});
    },
    createAccount: function (input) {
      return req("POST", "/accounts", {body: input});
    },
    registerStart: function (input) {
      return req("POST", "/auth/register/email", {body: input});
    },
    registerVerify: function (email, code) {
      return req("POST", "/auth/register/email/verify", {body: {email: email, code: code}});
    },
    /** login veloce OIDC (Apple/Google): idToken verificato lato server. */
    oidc: function (provider, idToken) {
      return req("POST", "/auth/oidc", {body: {provider: provider, idToken: idToken}});
    },

    // -------- eventi & tier
    events: function () {
      return req("GET", "/events");
    },
    event: function (id) {
      return req("GET", "/events/" + id);
    },
    tiers: function (eventId) {
      return req("GET", "/events/" + eventId + "/tiers");
    },
    /** crea evento; gateCode opzionale (campo di prima classe, niente workaround |VC:..|). */
    createEvent: function (input, token) {
      return req("POST", "/events", {body: input, token: token});
    },
    publishEvent: function (eventId, organizerId, token) {
      return req("POST", "/events/" + eventId + "/publish", {body: {organizerId: organizerId}, token: token});
    },
    concludeEvent: function (eventId, organizerId, token) {
      return req("POST", "/events/" + eventId + "/conclude", {body: {organizerId: organizerId}, token: token});
    },
    addTier: function (eventId, input, token) {
      // il backend richiede organizerId nel body per la fascia; se assente, l'handler lo ricava dal token via assertSelf
      var body = {name: input.name, priceCents: input.priceCents, note: input.note};
      if (input.organizerId) body.organizerId = input.organizerId;
      return req("POST", "/events/" + eventId + "/tiers", {body: body, token: token});
    },
    remind: function (eventId, organizerId, token) {
      return req("POST", "/events/" + eventId + "/remind", {body: {organizerId: organizerId}, token: token});
    },

    // -------- codice varco (gateCode)
    /** aggancio staff: risolve il codice nell'evento (mai un picker). */
    gateAccess: function (code, token) {
      return req("POST", "/gate/access", {body: {code: code}, token: token});
    },
    rotateGateCode: function (eventId, organizerId, token) {
      return req("POST", "/events/" + eventId + "/gate-code/rotate", {body: {organizerId: organizerId}, token: token});
    },
    revokeGateCode: function (eventId, organizerId, token) {
      return req("POST", "/events/" + eventId + "/gate-code/revoke", {body: {organizerId: organizerId}, token: token});
    },

    // -------- ordini / checkout
    createOrder: function (buyerId, eventId, quantity, token) {
      return req("POST", "/orders", {body: {buyerId: buyerId, eventId: eventId, quantity: quantity}, token: token});
    },
    getOrder: function (orderId, token) {
      return req("GET", "/orders/" + orderId, {token: token});
    },
    payOrder: function (orderId, token) {
      return req("POST", "/orders/" + orderId + "/pay", {body: {}, token: token});
    },
    checkout: function (orderId, token) {
      return req("POST", "/orders/" + orderId + "/checkout", {body: {}, token: token});
    },

    // -------- biglietti & mercato
    tickets: function (accountId, token) {
      return req("GET", "/accounts/" + accountId + "/tickets", {token: token});
    },
    listTicket: function (ticketId, ownerId, priceCents, token) {
      return req("POST", "/tickets/" + ticketId + "/list", {body: {ownerId: ownerId, priceCents: priceCents}, token: token});
    },
    unlistTicket: function (ticketId, ownerId, token) {
      return req("POST", "/tickets/" + ticketId + "/unlist", {body: {ownerId: ownerId}, token: token});
    },
    market: function () {
      return req("GET", "/market");
    },
    buyMarket: function (ticketId, buyerId, token) {
      return req("POST", "/market/" + ticketId + "/buy", {body: {buyerId: buyerId}, token: token});
    },

    // -------- validazione al varco (solo-online, server-side)
    /** QR a rotazione del possessore (token firmato dal server, chiave mai sul telefono). */
    accessToken: function (ticketId, token) {
      return req("GET", "/tickets/" + ticketId + "/access-token", {token: token});
    },
    /** scan staff: restituisce { outcome, holderName, meta } tra i 5 esiti. */
    scan: function (qrToken, staffToken) {
      return req("POST", "/validate/scan", {body: {token: qrToken}, token: staffToken});
    },

    /** chiamata generica (per endpoint non ancora incapsulati). */
    raw: function (method, path, opts) {
      return req(method, path, opts || {});
    }
  };

  if (typeof window !== "undefined") window.TINFT_API = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
