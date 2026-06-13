/* TINFT — i18n condiviso (IT/EN). Tier "curato": dizionario hardcoded.
   Uso: t('key') con la lingua corrente; setLang('en') per cambiare; window.tinftLang. */
(function () {
  var DICT = {
    it: {
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
      consent_required: "Devi accettare il trattamento dei dati per continuare.", optional: "facoltativo"
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
      consent_required: "You must accept data processing to continue.", optional: "optional"
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
  window.TINFT_I18N = DICT;
})();
