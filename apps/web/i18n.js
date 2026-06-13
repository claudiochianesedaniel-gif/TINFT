/* TINFT — i18n condiviso (IT/EN). Tier "curato": dizionario hardcoded.
   Uso: t('key') con la lingua corrente; setLang('en'); applyI18n() per [data-i18n]. */
(function () {
  var DICT = {
    it: {
      // wizard registrazione
      brand: "TINFT", reg_title: "Crea il tuo account", reg_sub: "Identità verificata, tutto in app. I dati in chiaro restano off-chain; on-chain solo l'hash del codice fiscale.",
      step_account: "Account", step_identity: "Dati SPID", step_confirm: "Conferma",
      email: "Email", email_ph: "nome@esempio.it", consent: "Acconsento al trattamento dei dati (GDPR) per identità e anti-bagarinaggio.",
      spid_fill: "Compila con SPID (demo)", nome: "Nome", cognome: "Cognome", cf: "Codice fiscale",
      dob: "Data di nascita", pob: "Luogo di nascita", gender: "Sesso", address: "Indirizzo di residenza",
      city: "Città", zip: "CAP", province: "Provincia", phone: "Telefono",
      next: "Continua", back: "Indietro", register: "Registrati", required: "Compila i campi obbligatori",
      review_title: "Riepilogo", done: "Account creato e verificato", done_msg: "Il tuo wallet è pronto. On-chain è registrato solo l'hash del codice fiscale.",
      verified: "Identità verificata", hash_cf: "Hash CF (on-chain)", residence: "Residenza",
      api_hint: "Avvia il backend con  pnpm --filter @tinft/api dev  (porta 3001) per salvare davvero.",
      api_down: "Backend non raggiungibile. Avvia l'API e riprova. Dati che verrebbero inviati:",
      consent_required: "Devi accettare il trattamento dei dati per continuare.", optional: "facoltativo",
      // sito pubblico
      nav_how: "Come funziona", nav_events: "Eventi", nav_org: "Organizzatori", nav_account: "Crea account",
      hero_kicker: "Biglietteria NFT · tutto in app", hero_title: "Il biglietto è tuo. Davvero.",
      hero_cta1: "Scopri gli eventi", hero_cta2: "Come funziona",
      // app chrome
      p_org: "Organizzatore", p_cli: "Cliente", p_val: "Validatore",
      n_dash: "Dashboard", n_club: "Club & Eventi", n_esplora: "Esplora", n_biglietti: "I miei biglietti", n_scan: "Scansione", n_accessi: "Accessi",
      b_buy: "Acquista", b_soldout: "Esaurito", b_limit: "Limite 2", b_checkin: "Check-in", b_sell: "Vendi", b_gift: "Regala", b_pay: "Compratore paga", b_cancel: "Annulla", b_exp_free: "Esporta (fee 25%)", b_exp_enf: "Esporta enforced", b_newclub: "Crea club", b_newevent: "Crea evento", b_enter: "Entra nel club →", b_scan: "Scansiona prossimo ospite",
      // app demo · titoli pagina (topbar)
      ti_dash:"Dashboard", su_dash:"Panoramica di tutti i club", ti_club:"Club & Eventi", su_club:"Crea club ed eventi", ti_cd:"Club", su_cd:"Gestisci eventi del club", ti_esp:"Esplora", su_esp:"Club ed eventi disponibili", ti_big:"I miei biglietti", su_big:"Wallet e azioni", ti_scan:"Scansione", su_scan:"Controllo accessi al varco", ti_acc:"Accessi", su_acc:"Riepilogo validazioni",
      // topbar destra
      tr_rev:"Ricavi piattaforma", tr_wallet:"Wallet", tr_tickets:"biglietti", tr_acc:"accessi", tr_gate:"Varco",
      // intestazioni sezione
      h_recent:"Eventi recenti", h_holders:"Holder & community", h_clubevents:"Eventi del club", h_upcoming:"Prossimi eventi", h_clubs:"Club",
      // kicker card
      k_news:"Novità", k_sales7:"Vendite · 7 giorni", k_incassi:"Incassi", k_scan:"Scansione varco", k_lastentries:"Ultimi accessi",
      // etichette tile
      tl_revtot:"Ricavi totali", tl_comm5:"Commissioni 5%", tl_roy:"Royalty 1% (0,5/0,5)", tl_exitfee:"Fee export 25%", tl_validated:"Accessi validati", tl_clubs:"Club", tl_events:"Eventi", tl_sold:"Biglietti venduti", tl_gross:"Incasso lordo", tl_royo:"Royalty P2P (org 0,5%)", tl_tickets:"Biglietti", tl_active:"Attivi", tl_collect:"Collectible", tl_fid:"Fidelity", tl_venduti:"Venduti", tl_incasso:"Incasso", tl_activetk:"Biglietti attivi", tl_used:"Usati/collectible",
      // varie
      m_allclubs:"← Tutti i club", m_buyfid:"Acquista Fidelity", m_fidclub:"FIDELITY DEL CLUB", m_vetrina:"IN VETRINA", m_backtk:"← Torna ai biglietti",
      // app-live (API)
      al_connect:"Connetti", al_connecting:"Connessione all'API…", al_offline:"Modalità DEMO offline · dati locali (avvia l'API per i dati reali)", al_online:"Connesso · dati reali dal backend", al_err:"Errore", al_enter:"Entra →", al_explore:"Esplora →", al_noclubs:"Nessun club. Creane uno.", al_notickets:"Nessun biglietto ancora.", al_ticket:"Biglietto", al_gate_val:"Varco · validazione", al_val_desc:"Biglietti del cliente da validare (dati reali dal backend).", al_val_none:"Nessun biglietto attivo. Compra qualcosa nel profilo Cliente.", al_validate:"Valida"
    },
    en: {
      brand: "TINFT", reg_title: "Create your account", reg_sub: "Verified identity, all in-app. Plaintext data stays off-chain; on-chain only the hash of the tax code.",
      step_account: "Account", step_identity: "SPID data", step_confirm: "Confirm",
      email: "Email", email_ph: "name@example.com", consent: "I consent to data processing (GDPR) for identity and anti-scalping.",
      spid_fill: "Fill with SPID (demo)", nome: "First name", cognome: "Last name", cf: "Tax code (CF)",
      dob: "Date of birth", pob: "Place of birth", gender: "Gender", address: "Residential address",
      city: "City", zip: "ZIP", province: "Province", phone: "Phone",
      next: "Continue", back: "Back", register: "Register", required: "Fill in the required fields",
      review_title: "Summary", done: "Account created and verified", done_msg: "Your wallet is ready. Only the hash of the tax code is stored on-chain.",
      verified: "Verified identity", hash_cf: "CF hash (on-chain)", residence: "Residence",
      api_hint: "Start the backend with  pnpm --filter @tinft/api dev  (port 3001) to persist for real.",
      api_down: "Backend unreachable. Start the API and retry. Data that would be sent:",
      consent_required: "You must accept data processing to continue.", optional: "optional",
      nav_how: "How it works", nav_events: "Events", nav_org: "Organizers", nav_account: "Sign up",
      hero_kicker: "NFT ticketing · all in-app", hero_title: "The ticket is truly yours.",
      hero_cta1: "Browse events", hero_cta2: "How it works",
      p_org: "Organizer", p_cli: "Customer", p_val: "Validator",
      n_dash: "Dashboard", n_club: "Clubs & Events", n_esplora: "Explore", n_biglietti: "My tickets", n_scan: "Scan", n_accessi: "Entries",
      b_buy: "Buy", b_soldout: "Sold out", b_limit: "Limit 2", b_checkin: "Check-in", b_sell: "Sell", b_gift: "Gift", b_pay: "Buyer pays", b_cancel: "Cancel", b_exp_free: "Export (25% fee)", b_exp_enf: "Export enforced", b_newclub: "Create club", b_newevent: "Create event", b_enter: "Enter club →", b_scan: "Scan next guest",
      ti_dash:"Dashboard", su_dash:"Overview of all clubs", ti_club:"Clubs & Events", su_club:"Create clubs and events", ti_cd:"Club", su_cd:"Manage club events", ti_esp:"Explore", su_esp:"Available clubs and events", ti_big:"My tickets", su_big:"Wallet and actions", ti_scan:"Scan", su_scan:"Gate access control", ti_acc:"Entries", su_acc:"Validation summary",
      tr_rev:"Platform revenue", tr_wallet:"Wallet", tr_tickets:"tickets", tr_acc:"entries", tr_gate:"Gate",
      h_recent:"Recent events", h_holders:"Holders & community", h_clubevents:"Club events", h_upcoming:"Upcoming events", h_clubs:"Clubs",
      k_news:"What's new", k_sales7:"Sales · 7 days", k_incassi:"Revenue", k_scan:"Gate scan", k_lastentries:"Last entries",
      tl_revtot:"Total revenue", tl_comm5:"5% commissions", tl_roy:"Royalty 1% (0.5/0.5)", tl_exitfee:"Export fee 25%", tl_validated:"Validated entries", tl_clubs:"Clubs", tl_events:"Events", tl_sold:"Tickets sold", tl_gross:"Gross revenue", tl_royo:"P2P royalty (org 0.5%)", tl_tickets:"Tickets", tl_active:"Active", tl_collect:"Collectible", tl_fid:"Fidelity", tl_venduti:"Sold", tl_incasso:"Revenue", tl_activetk:"Active tickets", tl_used:"Used/collectible",
      m_allclubs:"← All clubs", m_buyfid:"Buy Fidelity", m_fidclub:"CLUB FIDELITY", m_vetrina:"FEATURED", m_backtk:"← Back to tickets",
      al_connect:"Connect", al_connecting:"Connecting to the API…", al_offline:"Offline DEMO mode · local data (start the API for real data)", al_online:"Connected · real data from the backend", al_err:"Error", al_enter:"Enter →", al_explore:"Explore →", al_noclubs:"No clubs yet. Create one.", al_notickets:"No tickets yet.", al_ticket:"Ticket", al_gate_val:"Gate · validation", al_val_desc:"Customer tickets to validate (real data from the backend).", al_val_none:"No active tickets. Buy something in the Customer profile.", al_validate:"Validate"
    }
  };

  function getLang() { try { return localStorage.getItem("tinft_lang") || "it"; } catch (e) { return "it"; } }
  window.tinftLang = getLang();
  window.t = function (k) { var d = DICT[window.tinftLang] || DICT.it; return k in d ? d[k] : (DICT.it[k] || k); };
  window.setLang = function (l) {
    window.tinftLang = DICT[l] ? l : "it";
    try { localStorage.setItem("tinft_lang", window.tinftLang); } catch (e) {}
    if (typeof window.onLangChange === "function") window.onLangChange();
  };
  // Applica le traduzioni agli elementi con [data-i18n] / [data-i18n-ph] e ai toggle lingua.
  window.applyI18n = function () {
    document.documentElement.lang = window.tinftLang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = window.t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", window.t(el.getAttribute("data-i18n-ph"))); });
    document.querySelectorAll(".lang button[data-l]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-l") === window.tinftLang); });
  };
  window.TINFT_I18N = DICT;
})();
