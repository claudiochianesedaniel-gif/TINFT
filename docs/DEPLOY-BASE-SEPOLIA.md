# Deploy su Base Sepolia — runbook "chiavi in mano"

Distribuisce il core on-chain TINFT su **Base Sepolia** (testnet L2) e collega il
backend al mint reale. Il flusso è automatizzato da `scripts/deploy-base-sepolia.sh`
ed è **già provato end-to-end su anvil** (deploy + estrazione indirizzo + owner check);
sulla testnet servono solo una chiave finanziata e un RPC.

## Cosa viene distribuito
Lo script `contracts/script/Deploy.s.sol` distribuisce e **cabla i permessi** di:
- `TinftRoyaltySplit` — incassa la royalty 1% e la divide 0,5% TINFT / 0,5% organizzatore.
- `TinftTransferValidator` — allowlist operatori (ERC-721C): l'escrow può muovere i token vincolati.
- `TinftTicket` — l'NFT biglietto (ERC-721 + 721C, EIP-2981, fee d'uscita 25%). **owner = deployer.**
- `TinftEscrow` — vendita secondaria con tetto +5% e aggiornamento del costo base (R3).

## Prerequisiti
- **Foundry** (`forge`, `cast`, `anvil`) e **jq** installati.
- Una **chiave privata deployer** con un po' di **ETH su Base Sepolia** per il gas.
- Un **RPC** di Base Sepolia (pubblico `https://sepolia.base.org` oppure Alchemy/Infura).
- *(Opzionale)* una **BASESCAN_API_KEY** per verificare il codice su Basescan.

## 1) Wallet deployer + fondi (faucet)
Crea/usa un wallet di test (mai una chiave di produzione). Per ottenere ETH di test su Base Sepolia:
- Coinbase Developer Platform faucet (Base Sepolia), oppure un faucet Sepolia + **bridge** su Base Sepolia.
Verifica il saldo: `cast balance <indirizzo> --rpc-url https://sepolia.base.org`.

## 2) Configura `.env` (nella root del repo)
Parti da `.env.example`:
```bash
cp .env.example .env
```
e compila almeno:
```dotenv
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_PRIVATE_KEY=0x...            # chiave owner, con ETH per il gas (mint è onlyOwner)
TINFT_PAYEE=0x...                     # wallet TINFT: 0,5% royalty + fee d'uscita 25%
ORGANIZER_PAYEE=0x...                 # wallet organizzatore: 0,5% royalty (DEVE differire da TINFT_PAYEE)
BASESCAN_API_KEY=                     # opzionale: attiva --verify su Basescan
```

## 3) Deploy
```bash
./scripts/deploy-base-sepolia.sh
```
Lo script: valida le variabili, fissa `--sender = owner` (così l'owner dei contratti è il
deployer e la stessa chiave potrà coniare), distribuisce, **verifica su Basescan** se
`BASESCAN_API_KEY` è presente, estrae gli indirizzi dal broadcast di Foundry e salva
`deployments/<chainid>.json`. In coda stampa il **blocco `.env` per il backend**, es.:
```
CHAIN_RPC_URL=https://sepolia.base.org
CHAIN_PRIVATE_KEY=<la stessa DEPLOYER_PRIVATE_KEY usata qui (owner)>
TICKET_ADDRESS=0x….
```

## 4) Collega il backend al mint reale
Nel `.env` del backend (`services/api`) imposta le **tre** variabili stampate sopra. Se sono
tutte e tre presenti, l'API conia davvero su `TinftTicket.mint` (acquisto primario, ordini,
webhook pagamenti); altrimenti usa la `FakeChain`. La `CHAIN_PRIVATE_KEY` **deve essere l'owner**.

## 5) Smoke test on-chain
Avvia il backend con le variabili `CHAIN_*` e prova un ordine pagato:
```bash
# (esempio) crea e paga un ordine, poi verifica il proprietario on-chain del token
cast call $TICKET_ADDRESS 'ownerOf(uint256)(address)' <tokenId> --rpc-url $BASE_SEPOLIA_RPC_URL
# deve restituire il wallet del compratore; il biglietto avrà txHash valorizzato
```
Controllo rapido del deploy:
```bash
cast call $TICKET_ADDRESS 'owner()(address)' --rpc-url $BASE_SEPOLIA_RPC_URL   # = deployer
```

## Dry-run locale (già verificato)
Stesso script contro **anvil**, senza testnet:
```bash
anvil --silent &                         # chain-id 31337
RPC_URL=http://127.0.0.1:8545 \
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
TINFT_PAYEE=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
ORGANIZER_PAYEE=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  ./scripts/deploy-base-sepolia.sh
```
Esito atteso: 4 contratti distribuiti, `deployments/31337.json` scritto, `owner() == deployer`.

## Troubleshooting
- **`PayeesMustDiffer`**: `TINFT_PAYEE` e `ORGANIZER_PAYEE` devono essere indirizzi diversi.
- **`insufficient funds`**: il deployer non ha ETH su Base Sepolia → usa il faucet (passo 1).
- **mint fallisce con `OwnableUnauthorizedAccount`**: `CHAIN_PRIVATE_KEY` non è l'owner → usa la
  stessa chiave del deploy (lo script fissa `--sender = owner` proprio per evitarlo).
- **verifica Basescan fallita**: il deploy resta valido; ri-verifica con
  `forge verify-contract <addr> <Contratto> --chain base_sepolia --etherscan-api-key $BASESCAN_API_KEY`.

## Mainnet (Base)
Stesso flusso con `RPC_URL=$BASE_MAINNET_RPC_URL` e chiavi reali, **solo dopo un audit**
dei contratti. Non distribuire in mainnet senza revisione di sicurezza.
