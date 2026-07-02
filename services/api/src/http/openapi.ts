// Spec OpenAPI 3.1 curata delle rotte principali dell'API TINFT, servita su
// GET /openapi.json e visualizzata su GET /docs (Swagger UI da CDN). Documenta i
// flussi core (auth, ordini/checkout, mercato secondario, validazione, rimborsi,
// payout, osservabilità); non è esaustiva di ogni campo ma riflette i contratti reali.

export const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "TINFT API",
    version: "1.0.0",
    description:
      "Biglietteria con NFT nominativi su L2 (Base). Regole: prevendita 10% sul primo acquisto (solo TINFT), royalty 1% sul secondario (0,5/0,5), tetto rivendita +10%, max 3 biglietti/evento per identità, export libero con fee 25%."
  },
  servers: [{url: "/", description: "stessa origin che serve anche il frontend"}],
  tags: [
    {name: "salute", description: "liveness/readiness/metriche"},
    {name: "auth", description: "account, login, registrazione email (OTP)"},
    {name: "eventi"},
    {name: "ordini", description: "checkout primario (prevendita 10%)"},
    {name: "mercato", description: "rivendita secondaria (royalty 1%, tetto +10%)"},
    {name: "biglietti", description: "QR rotante, validazione, export"},
    {name: "pagamenti", description: "webhook PSP, rimborsi, payout"}
  ],
  components: {
    securitySchemes: {
      bearerAuth: {type: "http", scheme: "bearer", description: "token di sessione da POST /auth/login"},
      adminToken: {type: "apiKey", in: "header", name: "x-admin-token", description: "operazioni di piattaforma"}
    }
  },
  paths: {
    "/health": {get: {tags: ["salute"], summary: "Liveness", responses: {"200": {description: "ok"}}}},
    "/ready": {get: {tags: ["salute"], summary: "Readiness (controllo store non bloccante)", responses: {"200": {description: "stato di prontezza"}}}},
    "/metrics": {get: {tags: ["salute"], summary: "Metriche Prometheus (text)", responses: {"200": {description: "esposizione testuale"}}}},
    "/accounts": {
      post: {
        tags: ["auth"],
        summary: "Crea un account (CLIENTE/ORGANIZER/VALIDATOR/PLATFORM)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["nome", "cognome", "email"],
                properties: {
                  role: {type: "string", enum: ["CLIENTE", "ORGANIZER", "VALIDATOR", "PLATFORM"]},
                  nome: {type: "string"},
                  cognome: {type: "string"},
                  email: {type: "string"},
                  cfHash: {type: "string", description: "hash del codice fiscale (identità anti-bagarinaggio)"},
                  password: {type: "string"}
                }
              }
            }
          }
        },
        responses: {"201": {description: "account creato"}, "400": {description: "input non valido"}}
      }
    },
    "/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Login → token di sessione",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {type: "object", required: ["email", "password"], properties: {email: {type: "string"}, password: {type: "string"}}}
            }
          }
        },
        responses: {"200": {description: "{ token }"}, "401": {description: "credenziali errate"}}
      }
    },
    "/auth/register/email": {
      post: {tags: ["auth"], summary: "Avvia registrazione email (invia OTP; in dev restituisce devCode)", responses: {"201": {description: "registrazione in attesa"}}}
    },
    "/auth/register/email/verify": {
      post: {tags: ["auth"], summary: "Verifica OTP → crea l'account verificato", responses: {"201": {description: "account verificato"}, "400": {description: "codice errato"}}}
    },
    "/events": {
      get: {tags: ["eventi"], summary: "Elenco eventi (incluso gateCode)", responses: {"200": {description: "lista eventi"}}},
      post: {
        tags: ["eventi"],
        summary: "Crea un evento (organizzatore). gateCode opzionale: se assente viene generato unico",
        security: [{bearerAuth: []}],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["organizerId", "title", "venue", "date", "priceCents", "capacity"],
                properties: {
                  organizerId: {type: "string"},
                  title: {type: "string"},
                  venue: {type: "string"},
                  date: {type: "string"},
                  priceCents: {type: "integer", minimum: 0},
                  capacity: {type: "integer", minimum: 1},
                  status: {type: "string", enum: ["DRAFT", "ON_SALE", "CONCLUDED"]},
                  gateCode: {type: "string", description: "codice varco per lo staff; unico tra gli eventi"}
                }
              }
            }
          }
        },
        responses: {"201": {description: "evento creato (con gateCode)"}, "401": {description: "non autenticato"}, "409": {description: "gateCode già in uso"}}
      }
    },
    "/events/{id}/gate-code/rotate": {
      post: {tags: ["eventi"], summary: "Rigenera il codice varco (il vecchio smette di valere); solo l'organizzatore", security: [{bearerAuth: []}], responses: {"200": {description: "evento con nuovo gateCode"}, "403": {description: "non sei l'organizzatore"}}}
    },
    "/events/{id}/gate-code/revoke": {
      post: {tags: ["eventi"], summary: "Revoca il codice varco (nessun aggancio staff finché non si ruota); solo l'organizzatore", security: [{bearerAuth: []}], responses: {"200": {description: "evento senza gateCode"}, "403": {description: "non sei l'organizzatore"}}}
    },
    "/gate/access": {
      post: {
        tags: ["biglietti"],
        summary: "Aggancio staff al varco: risolve il codice nell'evento (rate-limited)",
        security: [{bearerAuth: []}],
        requestBody: {required: true, content: {"application/json": {schema: {type: "object", required: ["code"], properties: {code: {type: "string"}}}}}},
        responses: {"200": {description: "evento agganciato"}, "404": {description: "codice sconosciuto o revocato"}}
      }
    },
    "/orders": {
      post: {
        tags: ["ordini"],
        summary: "Crea un ordine PENDING (prevendita 10% inclusa nel totale)",
        security: [{bearerAuth: []}],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["buyerId", "eventId", "quantity"],
                properties: {buyerId: {type: "string"}, eventId: {type: "string"}, tierId: {type: "string"}, quantity: {type: "integer", minimum: 1}}
              }
            }
          }
        },
        responses: {"201": {description: "ordine PENDING con breakdown"}, "409": {description: "limite 3/evento o non in vendita"}}
      }
    },
    "/orders/{id}": {get: {tags: ["ordini"], summary: "Dettaglio ordine", security: [{bearerAuth: []}], responses: {"200": {description: "ordine"}}}},
    "/orders/{id}/pay": {
      post: {tags: ["ordini"], summary: "Paga (simulazione PSP): conia i biglietti. Riprendibile/idempotente", security: [{bearerAuth: []}], responses: {"200": {description: "ordine PAID + ticketIds"}}}
    },
    "/orders/{id}/checkout": {
      post: {tags: ["ordini"], summary: "Apre una sessione di checkout PSP per l'ordine", security: [{bearerAuth: []}], responses: {"201": {description: "{ checkoutUrl, providerRef, payment }"}}}
    },
    "/orders/{id}/cancel": {
      post: {tags: ["ordini"], summary: "Annulla un ordine PENDING", security: [{bearerAuth: []}], responses: {"200": {description: "ordine CANCELLED"}, "409": {description: "ordine già pagato"}}}
    },
    "/orders/{id}/refund": {
      post: {tags: ["pagamenti"], summary: "Rimborsa un ordine pagato: revoca i biglietti e storna ricavi (PIATTAFORMA)", security: [{adminToken: []}, {bearerAuth: []}], responses: {"200": {description: "ordine rimborsato"}, "403": {description: "non autorizzato"}}}
    },
    "/webhooks/psp": {
      post: {tags: ["pagamenti"], summary: "Webhook PSP (payment_succeeded/failed/refunded). Idempotente, ritentabile", responses: {"200": {description: "esito gestione"}}}
    },
    "/market": {get: {tags: ["mercato"], summary: "Listino del mercato secondario (royalty e tetto calcolati)", responses: {"200": {description: "biglietti LISTED"}}}},
    "/market/{ticketId}/buy": {
      post: {
        tags: ["mercato"],
        summary: "Compra un biglietto in vendita (royalty 1% allo split, costo base trasferito)",
        security: [{bearerAuth: []}],
        responses: {"200": {description: "{ ticket, royalty, paidByBuyerCents }"}, "409": {description: "limite 3/evento"}}
      }
    },
    "/tickets/{id}/list": {post: {tags: ["mercato"], summary: "Metti in vendita (tetto +10%); solo il proprietario", security: [{bearerAuth: []}], responses: {"201": {description: "biglietto LISTED"}, "409": {description: "oltre il tetto o revocato"}}}},
    "/tickets/{id}/access-token": {
      get: {tags: ["biglietti"], summary: "Token di accesso firmato (QR rotante ~30s); solo il proprietario", security: [{bearerAuth: []}], responses: {"200": {description: "{ token, exp, rotateSeconds }"}, "403": {description: "non sei il proprietario"}}}
    },
    "/validate/scan": {
      post: {
        tags: ["biglietti"],
        summary: "Validazione al varco di un token scansionato (staff)",
        security: [{bearerAuth: []}],
        requestBody: {required: true, content: {"application/json": {schema: {type: "object", required: ["token"], properties: {token: {type: "string"}}}}}},
        responses: {"200": {description: "{ outcome: VALID|SCREENSHOT|DUPLICATE|ESCROW|FAKE }"}}
      }
    },
    "/platform/payouts": {get: {tags: ["pagamenti"], summary: "Incassi venditore in attesa di liquidazione (PIATTAFORMA)", security: [{adminToken: []}], responses: {"200": {description: "lista payout pendenti"}}}},
    "/payouts/{transferId}/settle": {post: {tags: ["pagamenti"], summary: "Marca un incasso venditore come liquidato (PIATTAFORMA)", security: [{adminToken: []}], responses: {"200": {description: "transfer liquidato"}}}}
  }
} as const;

/** Pagina Swagger UI (asset da CDN) che carica /openapi.json. */
export const swaggerUiHtml = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>TINFT API — documentazione</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({url: "/openapi.json", dom_id: "#swagger-ui", deepLinking: true});
  </script>
</body>
</html>`;
