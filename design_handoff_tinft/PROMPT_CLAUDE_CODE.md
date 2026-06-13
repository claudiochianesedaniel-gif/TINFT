# Prompt di avvio per Claude Code — Progetto TINFT (Livello 2)

> Incolla il blocco qui sotto come primo messaggio in Claude Code, dopo aver messo `design_handoff_tinft/` nel repo.

---

Sei lo sviluppatore lead del progetto **TINFT** (biglietteria con biglietti-NFT, tutto via app proprietaria, nessun device esterno). Nella cartella `design_handoff_tinft/` trovi la **specifica funzionale 1:1**: leggi `README.md` e apri i file `.dc.html` (sono prototipi di design HTML, non codice da copiare — ricreane logica e UI nello stack che proponi).

**Vincoli non negoziabili:**
- Royalty trasferimento **1%** del prezzo originale, a carico del compratore, split **0,5% TINFT + 0,5% organizzatore**, *enforced* on-chain.
- **Escrow** sul P2P a pagamento (lock → pay atomico → reclaim a timeout).
- **Tetto rivendita +5%** per passaggio (base di costo per token); **max 2 biglietti/evento per identità** (`hash(CF)`).
- **Export** a scelta: (A) rilascio con fee 25% / (B) enforced con royalty perpetua.
- Custodia **custodial** (account abstraction, niente seed/gas per l'utente).

**Prima di scrivere codice:** proponi (1) stack, (2) struttura repo, (3) scelta L2, (4) piano a milestone. Aspetta il mio ok, poi procedi milestone per milestone, con test.

**Ordine dei task e criteri di "fatto" (Definition of Done):**

1. **Smart contract — core** *(L2 testnet)*
   - ERC-721 + ERC-721C con Transfer Validator + allowlist operatori.
   - DoD: mint di un biglietto; un trasferimento fuori dagli operatori allowlist è **bloccato**; test passano.
2. **Royalty + split**
   - EIP-2981 + split contract 0,5/0,5; l'1% è trattenuto su ogni vendita via modulo TINFT.
   - DoD: una vendita P2P accredita 0,5% a due wallet distinti; verificato in test.
3. **Escrow**
   - `list()` / `pay()` (release atomico token↔fondi + royalty) / `reclaim()` (timeout).
   - DoD: il compratore paga → riceve il token e il venditore i fondi in **una** tx; senza pagamento entro ttl il token torna al venditore.
4. **Regole anti-bagarinaggio**
   - `paid` per token; rifiuto prezzo > `paid*1.05`; mapping `hash(CF)→eventId→count ≤ 2`.
   - DoD: test che rifiutano prezzo eccedente e il 3° biglietto stesso evento/identità.
5. **Export**
   - `exportFree()` (incassa 25%, rimuove da policy) / `exportEnforced()`.
   - DoD: dopo `exportFree` il token è trasferibile liberamente; dopo `exportEnforced` la royalty 1% scatta ancora.
6. **Backend + DB**
   - API per eventi, biglietti, trasferimenti, account; modello dati dal README.
   - DoD: i 4 profili (cliente/organizzatore/validatore/piattaforma) leggono/scrivono via API.
7. **Pagamenti**
   - PSP (Stripe/Nexi) sandbox + webhook → mint / release escrow.
   - DoD: checkout euro sandbox → biglietto mintato al wallet custodial; ricevuta + idempotenza webhook.
8. **Identità SPID**
   - OIDC reale; CF cifrato off-chain, solo `hash` on-chain.
   - DoD: login SPID sandbox crea account verificato; limite 2/evento legato all'identità.
9. **Frontend reali**
   - Ricrea App / Sito / Console dai prototipi, collegati al backend.
   - DoD: il flusso Sito→App→Console funziona su dati reali (non più localStorage).
10. **Audit & hardening** prima di qualsiasi mainnet.

**Modo di lavorare:** una milestone per volta, PR con test, e segnala sempre i punti che richiedono decisione legale/fiscale (custodia, anti-bagarinaggio, IVA su royalty) senza bloccarti sul codice.
