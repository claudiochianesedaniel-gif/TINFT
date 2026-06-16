#!/usr/bin/env bash
# Deploy "chiavi in mano" del core TINFT su Base (Sepolia per default).
#
# Distribuisce TinftRoyaltySplit + TinftTransferValidator + TinftTicket + TinftEscrow
# (con i permessi già cablati), poi estrae l'indirizzo di TinftTicket dal broadcast
# di Foundry e stampa il blocco .env pronto da incollare nel backend.
#
# Funziona anche su anvil (dry-run): basta puntare RPC_URL all'istanza locale.
#
# Variabili richieste (da .env o ambiente):
#   BASE_SEPOLIA_RPC_URL   RPC di Base Sepolia            (oppure RPC_URL per override, es. anvil)
#   DEPLOYER_PRIVATE_KEY   chiave dell'owner, con ETH per il gas (mint è onlyOwner)
#   TINFT_PAYEE            wallet TINFT: 0,5% royalty + fee d'uscita 25%
#   ORGANIZER_PAYEE       wallet organizzatore: 0,5% royalty  (DEVE differire da TINFT_PAYEE)
# Opzionali:
#   BASESCAN_API_KEY       se presente (e rete non locale) verifica i contratti su Basescan
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS="$ROOT/contracts"

# carica .env del repo se presente (comodità locale; le variabili d'ambiente vincono)
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi

fail() { echo "✗ ERRORE: $*" >&2; exit 1; }

RPC="${RPC_URL:-${BASE_SEPOLIA_RPC_URL:-}}"
KEY="${DEPLOYER_PRIVATE_KEY:-}"
TINFT_PAYEE="${TINFT_PAYEE:-}"
ORGANIZER_PAYEE="${ORGANIZER_PAYEE:-}"

[ -n "$RPC" ] || fail "RPC mancante: imposta BASE_SEPOLIA_RPC_URL (o RPC_URL per anvil)."
[ -n "$KEY" ] || fail "DEPLOYER_PRIVATE_KEY mancante (chiave owner con ETH per il gas)."
[ -n "$TINFT_PAYEE" ] || fail "TINFT_PAYEE mancante (wallet 0,5% royalty + fee d'uscita)."
[ -n "$ORGANIZER_PAYEE" ] || fail "ORGANIZER_PAYEE mancante (wallet 0,5% royalty organizzatore)."
[ "$TINFT_PAYEE" != "$ORGANIZER_PAYEE" ] || fail "TINFT_PAYEE e ORGANIZER_PAYEE devono differire (PayeesMustDiffer)."

CHAIN_ID="$(cast chain-id --rpc-url "$RPC")" || fail "RPC non raggiungibile: $RPC"
OWNER="$(cast wallet address --private-key "$KEY")" || fail "DEPLOYER_PRIVATE_KEY non valida."
echo "→ Rete chain-id=$CHAIN_ID  RPC=$RPC  owner/deployer=$OWNER"

VERIFY_ARGS=()
if [ -n "${BASESCAN_API_KEY:-}" ] && [ "$CHAIN_ID" != "31337" ]; then
  VERIFY_ARGS=(--verify)
  echo "→ Verifica Basescan: ATTIVA"
else
  echo "→ Verifica Basescan: disattivata (nessuna BASESCAN_API_KEY o rete locale)"
fi

# --sender = owner: così msg.sender nello script (e quindi l'owner dei contratti)
# è il deployer → la stessa chiave potrà coniare (mint onlyOwner) dal backend.
export TINFT_PAYEE ORGANIZER_PAYEE
echo "→ Deploy in corso…"
forge script "$CONTRACTS/script/Deploy.s.sol:Deploy" \
  --root "$CONTRACTS" \
  --rpc-url "$RPC" \
  --private-key "$KEY" \
  --sender "$OWNER" \
  --broadcast \
  "${VERIFY_ARGS[@]}" \
  -vvv

RUN="$CONTRACTS/broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"
[ -f "$RUN" ] || fail "artifact di broadcast non trovato: $RUN"

addr() { jq -r --arg n "$1" '[.transactions[] | select(.contractName==$n) | .contractAddress] | last // empty' "$RUN"; }
TICKET="$(addr TinftTicket)"
ESCROW="$(addr TinftEscrow)"
VALIDATOR="$(addr TinftTransferValidator)"
SPLIT="$(addr TinftRoyaltySplit)"
[ -n "$TICKET" ] || fail "indirizzo TinftTicket non estratto dal broadcast ($RUN)."

mkdir -p "$ROOT/deployments"
OUT="$ROOT/deployments/$CHAIN_ID.json"
jq -n --arg ticket "$TICKET" --arg escrow "$ESCROW" --arg validator "$VALIDATOR" \
      --arg split "$SPLIT" --arg owner "$OWNER" --argjson chainId "$CHAIN_ID" \
  '{chainId:$chainId, owner:$owner, ticket:$ticket, escrow:$escrow, transferValidator:$validator, royaltySplit:$split}' \
  >"$OUT"

cat <<EOF

✓ Deploy completato (chain-id=$CHAIN_ID)
  TinftTicket            = $TICKET
  TinftEscrow            = $ESCROW
  TinftTransferValidator = $VALIDATOR
  TinftRoyaltySplit      = $SPLIT
  owner                  = $OWNER
  indirizzi salvati in   = $OUT

── Incolla nel .env del backend (services/api) per attivare il mint on-chain reale ──
CHAIN_RPC_URL=$RPC
CHAIN_PRIVATE_KEY=<la stessa DEPLOYER_PRIVATE_KEY usata qui (owner)>
TICKET_ADDRESS=$TICKET
EOF
