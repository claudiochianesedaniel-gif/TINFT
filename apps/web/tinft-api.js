/* TINFT — client API reale (backend live su Render).
   Esposto come window.TINFT_API. Tutte le funzioni restituiscono Promise.
   Caricato come <script src> nell'helmet del Design Component. */
(function () {
  var BASE = 'https://tinft-api.onrender.com';

  async function jf(method, path, opts) {
    opts = opts || {};
    var headers = { 'content-type': 'application/json' };
    if (opts.token) headers['authorization'] = 'Bearer ' + opts.token;
    var r = await fetch(BASE + path, {
      method: method,
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    var d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok) {
      var msg = (d && (d.message || d.error)) || ('HTTP ' + r.status);
      var err = new Error(msg);
      err.status = r.status; err.data = d;
      // Sessione non piu' valida (token scaduto, firma non valida, account rimosso da un
      // redeploy): senza questo aggancio l'utente resta bloccato su "token scaduto" senza
      // poter fare nulla. L'app ci si registra per pulire la sessione e tornare al login.
      if (r.status === 401 && opts.token && typeof window.TINFT_API.onAuthError === 'function') {
        try { window.TINFT_API.onAuthError(err); } catch (e2) {}
      }
      throw err;
    }
    return d;
  }

  window.TINFT_API = {
    BASE: BASE,
    raw: jf,
    // salute / warm-up (la free instance dorme: primo colpo ~50s)
    warm: function () { return fetch(BASE + '/ready').then(function (r) { return r.ok; }).catch(function () { return false; }); },
    // auth
    login: function (email, password) { return jf('POST', '/auth/login', { body: { email: email, password: password } }); },
    registerStart: function (b) { return jf('POST', '/auth/register/email', { body: b }); },
    registerVerify: function (email, code) { return jf('POST', '/auth/register/email/verify', { body: { email: email, code: code } }); },
    createAccount: function (b) { return jf('POST', '/accounts', { body: b }); },
    // eventi
    events: function () { return jf('GET', '/events'); },
    tiers: function (eventId) { return jf('GET', '/events/' + eventId + '/tiers'); },
    createEvent: function (b, token) { return jf('POST', '/events', { body: b, token: token }); },
    publishEvent: function (eventId, token) { return jf('POST', '/events/' + eventId + '/publish', { token: token }); },
    addTier: function (eventId, b, token) { return jf('POST', '/events/' + eventId + '/tiers', { body: b, token: token }); },
    // ordini / pagamento
    createOrder: function (buyerId, eventId, quantity, token, tierId) {
      var body = { buyerId: buyerId, eventId: eventId, quantity: quantity };
      if (tierId) body.tierId = tierId;
      return jf('POST', '/orders', { body: body, token: token });
    },
    payOrder: function (orderId, token) { return jf('POST', '/orders/' + orderId + '/pay', { token: token }); },
    checkout: function (orderId, token) { return jf('POST', '/orders/' + orderId + '/checkout', { token: token }); },
    getOrder: function (orderId, token) { return jf('GET', '/orders/' + orderId, { token: token }); },
    // biglietti
    tickets: function (accountId, token) { return jf('GET', '/accounts/' + accountId + '/tickets', { token: token }); },
    orders: function (accountId, token) { return jf('GET', '/accounts/' + accountId + '/orders', { token: token }); },
    accessToken: function (ticketId, token) { return jf('GET', '/tickets/' + ticketId + '/access-token', { token: token }); },
    // validazione al varco
    scan: function (accessToken, token) { return jf('POST', '/validate/scan', { body: { token: accessToken }, token: token }); },
    // username pubblico (@handle): etichetta per ricerca, regali e verifica al varco
    userByUsername: function (username) { return jf('GET', '/users/@' + encodeURIComponent(String(username).replace(/^@+/, ''))); },
    usernameAvailable: function (username) { return jf('GET', '/users/username-available?u=' + encodeURIComponent(String(username).replace(/^@+/, ''))); },
    setUsername: function (accountId, username, token) { return jf('POST', '/accounts/' + accountId + '/username', { body: { username: username }, token: token }); },
    // regalo/invio di un biglietto a un altro utente TINFT, per @username
    transferTicket: function (ticketId, ownerId, toUsername, token) { return jf('POST', '/tickets/' + ticketId + '/transfer', { body: { ownerId: ownerId, toUsername: toUsername }, token: token }); },
    // verifica manuale al varco per @username (fallback quando il QR non si legge)
    gateLookup: function (gateCode, username, token) { return jf('GET', '/gate/lookup?code=' + encodeURIComponent(gateCode) + '&username=' + encodeURIComponent(String(username).replace(/^@+/, '')), { token: token }); },
    // mercato secondario
    market: function () { return jf('GET', '/market'); },
    listTicket: function (ticketId, ownerId, priceCents, token) { return jf('POST', '/tickets/' + ticketId + '/list', { body: { ownerId: ownerId, priceCents: priceCents }, token: token }); },
    buyMarket: function (ticketId, buyerId, token) { return jf('POST', '/market/' + ticketId + '/buy', { body: { buyerId: buyerId }, token: token }); }
  };
})();

/* Firebase Authentication (email-link, passwordless) — gira tutto lato client.
   Richiede gli script firebase-app-compat + firebase-auth-compat caricati prima. */
(function () {
  var FB_CONFIG = {
    apiKey: 'AIzaSyB-bN-taI4fY5sJ4UTtmy1fN3eDNdQ2dG8',
    authDomain: 'tinft-e2281.firebaseapp.com',
    projectId: 'tinft-e2281',
    storageBucket: 'tinft-e2281.firebasestorage.app',
    messagingSenderId: '1084170754147',
    appId: '1:1084170754147:web:d05f9b151716391d6ac056'
  };
  window.TINFT_FB = {
    ready: false,
    _auth: null,
    init: function () {
      try {
        if (window.firebase && !this._auth) {
          if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FB_CONFIG);
          this._auth = firebase.auth();
          this.ready = true;
        }
      } catch (e) {}
      return this.ready;
    },
    available: function () { return !!window.firebase; },
    _settings: function () { return { url: location.origin + location.pathname, handleCodeInApp: true }; },
    sendLink: function (email) {
      this.init();
      try { localStorage.setItem('tinft_fb_email', email); } catch (e) {}
      return this._auth.sendSignInLinkToEmail(email, this._settings());
    },
    isLink: function () {
      this.init();
      try { return this._auth.isSignInWithEmailLink(location.href); } catch (e) { return false; }
    },
    completeLink: function () {
      this.init();
      var email = '';
      try { email = localStorage.getItem('tinft_fb_email') || ''; } catch (e) {}
      if (!email) { email = (window.prompt('Conferma la tua email per completare l\u2019accesso') || ''); }
      return this._auth.signInWithEmailLink(email, location.href).then(function (res) {
        try { localStorage.removeItem('tinft_fb_email'); } catch (e) {}
        try { history.replaceState(null, '', location.origin + location.pathname); } catch (e) {}
        return res.user;
      });
    }
  };
})();
