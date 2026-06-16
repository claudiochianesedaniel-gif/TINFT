# ▶️ RIPRENDI QUI (nota per la prossima sessione)

> Aggiornato: 2026-06-16. Branch di lavoro: **`claude/laughing-albattani-epjzap`** (tutto committato, CI verde).

## Stato attuale (fatto e verificato)
- **Contratti** Foundry: **74/74** (fuzz + invarianti). Regole on-chain: **tetto rivendita +10%**, **max 3 biglietti/evento**, royalty 1% (0,5% TINFT + 0,5% organizzatore), prevendita 10%, export 25%.
- **Backend** (services/api): **147 test + 3 skip (DB)**, `tsc` pulito. Include: OTP email reale via **Resend** (Fase 3, dietro interfaccia `EmailSender`, fallback devCode), **P.IVA + dati di fatturazione OBBLIGATORI** per la creazione club organizzatore, affidabilità pagamento→mint, rimborsi/payout, `/metrics`, `/openapi.json` + `/docs`.
- Demo web e documenti allineati a **+10%/3**.

## COMPITO IMMEDIATO: Fase 1 — deploy dei contratti su Base Sepolia
In questa nuova sessione la **rete verso Base Sepolia dovrebbe essere consentita** (l'utente ha cambiato "Accesso alla rete" dell'ambiente). Passi:

1. **Verifica rete** (l'utente fornisce l'RPC Alchemy Base Sepolia — contiene una API key, NON salvarla nel repo):
   `export PATH="$HOME/.foundry/bin:$PATH"; cast chain-id --rpc-url "<RPC_BASE_SEPOLIA>"` → deve dare **84532**. Se dà `403 Host not in allowlist`, la rete è ancora chiusa: dirlo all'utente.
2. **Chiave deployer usa-e-getta** (mai in chat): genera con `cast wallet new`, salva SOLO la chiave in `/root/.tinft-deployer.key` (fuori dal repo), mostra all'utente l'**indirizzo** da finanziare con ~0,015 ETH su Base Sepolia.
3. **Deploy** dalla root del repo:
   ```bash
   export BASE_SEPOLIA_RPC_URL="<RPC>"
   export DEPLOYER_PRIVATE_KEY="$(cat /root/.tinft-deployer.key)"
   export TINFT_PAYEE=0xDfCD3A96070C966CCE21DB6142aB25AD3879cc8e   # wallet dell'utente (incassa 0,5% royalty)
   export ORGANIZER_PAYEE=<un indirizzo DIVERSO da TINFT_PAYEE>     # es. l'indirizzo deployer generato
   cd contracts && forge test && cd ..        # atteso 74/74
   ./scripts/deploy-base-sepolia.sh           # distribuisce i 4 contratti + salva deployments/84532.json
   ```
4. Riporta all'utente i **4 indirizzi** (TinftTicket/Escrow/RoyaltySplit/TransferValidator) + link `sepolia.basescan.org`.

## Poi: Fase 2 — backend con mint reale
Imposta nel backend (`services/api`, via env, NON committare): `CHAIN_RPC_URL=<RPC>`, `CHAIN_PRIVATE_KEY=<la stessa chiave deployer = owner>`, `TICKET_ADDRESS=<indirizzo TinftTicket>`. Poi un acquisto pagato deve coniare on-chain (verifica `cast call <ticket> 'ownerOf(uint256)(address)' <tokenId>` = wallet compratore). Guida completa: `docs/DEPLOY-BASE-SEPOLIA.md`.

## Regole/sicurezza
- Mai committare RPC con API key né chiavi private. La chiave deployer vive solo nel container effimero (rigenerala se la sessione è nuova).
- Dettagli tecnici: `DEV-HANDOFF.md`. Per il design: `DESIGN-HANDOFF.md`. Prova locale: `PROVA.md`.
