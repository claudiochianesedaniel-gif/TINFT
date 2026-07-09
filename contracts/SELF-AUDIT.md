# TINFT — Self-audit di sicurezza dei contratti

> ⚠️ **Self-audit INTERNO.** NON sostituisce un audit indipendente di terza parte
> (OpenZeppelin / Trail of Bits / Hacken / Certik), **obbligatorio prima della mainnet**.
> Serve a trovare/correggere ora e a ridurre costo e tempo dell'audit esterno.
> Eseguito dopo i 3 task: **tetto +5%**, **fee 1% TINFT (biglietto attivo)**, **burn definitivo all'ingresso**.

Data: 2026-07-09 · Solidity 0.8.28 · Foundry.

---

## FASE A — Preparazione

- **`forge test`: 92/92 verdi** (0 failed, 0 skipped) — 10 suite, incl. fuzz + invarianti stateful.
- **Coverage** (`forge coverage`, obiettivo >90% sui core):

  | File | Lines | Statements | Branches | Funcs |
  |---|---|---|---|---|
  | `TinftTicket.sol` | 98.15% | 98.32% | 90.00% | 100% |
  | `TinftEscrow.sol` | 100% | 93.65% | 73.33% | 100% |
  | `TinftRoyaltySplit.sol` | 92.00% | 96.43% | 100% | 83.33% |
  | `TinftTransferValidator.sol` | 100% | 100% | 100% | 100% |
  | **Totale** | **97.86%** | 96.73% | 85.00% | 97.44% |

  Rami scoperti residui: alcuni `revert`/short-circuit di guardia (es. fallback `resaleRoyaltyReceiver`, branch `Escrow` su importi limite). Nessuno su percorso di fondi non testato. Da estendere in FASE E dell'audit esterno.
- **Gas (baseline, media)**: `mint` ~162k · `mintSpecial` ~192k (primo warm) · `markUsed` ~53k (con burn) · `list` ~97k · `pay` ~138k · `exportFree` ~48k. Nessuna regressione anomala introdotta dal burn (`markUsed` include un `_burn` + decremento `heldCount`).
- **Matrice funzioni esterne / ruoli**: vedi FASE B.

## FASE B — Controllo accessi & ruoli

Matrice (chi può chiamare):

| Funzione | Contratto | Autorizzazione | Esito |
|---|---|---|---|
| `mint`, `mintSpecial` | Ticket | `onlyOwner` (backend TINFT) | ✅ |
| `markUsed` (validazione+burn) | Ticket | `isValidatorOperator[msg.sender]` (allowlist) | ✅ |
| `recordSale` | Ticket | `isSaleOperator[msg.sender]` (allowlist, = escrow) | ✅ |
| `setIdentity`, `setEventEnd`, `setPlatformTreasury`, `setTransferValidator`, `setSaleOperator`, `setValidatorOperator` | Ticket | `onlyOwner` | ✅ |
| `exportFree`, `exportEnforced` | Ticket | owner del token (`ownerOf == msg.sender`) | ✅ |
| `list`, `pay`, `reclaim`, `cancel` | Escrow | `list`/`cancel` con ownership/seller check; `pay` chiunque paghi il totale | ✅ |
| `pause`/`unpause` | Escrow | `onlyOwner` | ✅ |
| `setOperator` | Validator | `onlyOwner` | ✅ |
| `withdraw` | RoyaltySplit | il beneficiario (pull) | ✅ |

- ✅ **Nessun mint/burn richiamabile da indirizzi non autorizzati**: `mint`/`mintSpecial` `onlyOwner`; il burn avviene **solo** dentro `markUsed`, gated da `isValidatorOperator`.
- ✅ **Ownable2Step** su `TinftTicket`, `TinftEscrow`, `TinftTransferValidator` (trasferimento ownership in due passi → nessuna perdita per indirizzo errato). `TinftRoyaltySplit` non ha owner: i payee sono `immutable` (nessuna superficie di manomissione).
- ✅ **Pausable** su `TinftEscrow` (`pause` sospende `list`/`pay`; `reclaim`/`cancel` restano sempre attivi → i token non restano intrappolati).

## FASE C — Logica economica (i 3 task nuovi)

- ✅ **Tetto +5%** (`TinftEscrow.list`): `cap = paidOf * RESALE_CAP_BPS / 10_000` con `RESALE_CAP_BPS = 10_500`. Costante nominata; nessun `110`/`* 11` residuo nei sorgenti. Test: al tetto passa, +1 wei → `revert PriceAboveCap` (`TinftFuzz.testFuzz_ResaleCapEnforced`, `TinftActiveResaleFee.test_ResaleCap_FivePercent`).
- ✅ **Fee 1% condizionale** (`TinftTicket.resaleRoyaltyReceiver` usata da `Escrow.pay`): biglietto **ATTIVO** (`isTicketActive`: non `used` e prima della `eventEndOf`) → receiver = `platformTreasury` (100% a TINFT); **mero NFT** → receiver = split EIP-2981 (0,5/0,5). Importo `royaltyDue = originalPrice * 100 / 10_000` (basis point, mai float). Split conserva il valore, wei dispari all'organizzatore (`testFuzz_SplitConservationAndOddWei`). Verificato on-chain su anvil: attivo → 1% intero al `TINFT_PAYEE`; post-evento → 0,005+0,005.
  - **Fallback anti-blocco**: se `platformTreasury == address(0)`, `resaleRoyaltyReceiver` ripiega sullo split → una vendita non può mai revertire per receiver non impostato (`test_TreasuryUnset_FallsBackToSplit`).
- ✅ **Burn definitivo** (`TinftTicket.markUsed`): su VALID di un biglietto normale → `_burn(tokenId)` (ERC-721): `ownerOf` reverte, `Transfer(holder, address(0), tokenId)` emesso, `heldCount` dell'identità decrementato (slot 3/evento liberato). **Signature** (`isSpecial`) esente. Un token bruciato non è listabile/trasferibile/esportabile (naturale: `_requireOwned`/`ownerOf` revertono). Test in `TinftBurnOnEntry.t.sol` (7 casi) + E2E anvil (backend→markUsed→ownerOf reverte).
- ✅ **Fee/royalty in basis point**, mai float; somma quote = 100% del dovuto (`_distribute`: `toTinft + toOrganizer == amount`).

## FASE D — Vulnerabilità classiche

- ✅ **Reentrancy**: `nonReentrant` su `Escrow.list/pay/reclaim/cancel`, `Ticket.exportFree`, `RoyaltySplit.withdraw`. Pattern **checks-effects-interactions**: in `pay` il listing è `delete`-ato **prima** dei trasferimenti; in `exportFree` `exportModeOf`/`policyBound` sono scritti prima della `call`. Test dedicati: venditore malevolo (`test_ReentrantSellerCannotExploit`) e tesoreria malevola (`test_ExportFreeReentrancyGuarded`).
- ✅ **Pull over push** sulle royalty: lo split accredita saldi e i beneficiari ritirano con `withdraw` (un ritiro fallito non blocca l'altro). Nota: `Escrow.pay` fa comunque `call` diretta al receiver della fee e al venditore; se una fallisce l'intera `pay` reverte (nessun fondo bloccato, il compratore non perde nulla) — coperto da `test_ReentrantSellerCannotExploit`.
- ✅ **Overflow/underflow**: Solidity 0.8 (check automatici). Nessun blocco `unchecked` nei contratti.
- ✅ **Nessun `tx.origin`** per autorizzazione (solo `msg.sender`).
- ✅ **`block.timestamp`**: usato solo per soglie ampie (`eventEndOf` fine evento, `ttl` escrow), non per casualità né precisione critica. Lint `block-timestamp` atteso e accettabile (deriva di pochi secondi ininfluente su soglie di ore/giorni).
- ✅ **Nessun `delegatecall`**; l'unico `call` esterno è verso payee/treasury con return value **controllato** (`if (!ok) revert`).
- ✅ **Nessun loop illimitato**: nessuna iterazione su array non-bounded (heldCount è una mappa, non un array).

## FASE E — ERC-721 / 721C / standard

- ✅ **EIP-2981**: `royaltyInfo` = default royalty allo split (1%); `resaleRoyaltyReceiver` è un helper TINFT che sceglie il receiver reale a runtime senza rompere lo standard (`royaltyInfo` resta coerente per marketplace terzi).
- ✅ **Transfer-validator (721C) e `_burn`**: `_update` invoca il validator solo quando `from != 0 && to != 0`; nel **burn** `to == address(0)` → validator **non** invocato → il burn è sempre consentito. L'escrow su token inesistente reverte con `ERC721NonexistentToken` (revert **gestito**, non panic): non si può listare/comprare un token bruciato (`test_BurnedTicket_NotListable`).
- ✅ **`tokenURI`/metadati**: on-chain solo `hash(CF)` (`identityOf`), mai CF/nome in chiaro. Nessun `tokenURI` che esponga PII (metadati off-chain).
- ✅ **`approve`/`setApprovalForAll`**: non aggirano tetto né burn — i trasferimenti reali passano comunque da `_update` (policy) e la vendita passa dall'escrow (tetto+fee). Un token bruciato non è approvabile (non esiste).

## FASE F — Fondi & payout

- ✅ **`TINFT`/`ORGANIZER` payee** in `RoyaltySplit`: `immutable`, controllati in constructor (`ZeroAddress`, `PayeesMustDiffer`) → mai `address(0)`, sempre diversi.
- ✅ **`platformTreasury`** (fee d'uscita 25% + fee 1% biglietto attivo): impostabile solo `onlyOwner`; se non impostata, `exportFree` reverte `TreasuryNotSet` e la fee di rivendita ripiega sullo split (nessun fondo perso/bloccato).
- ✅ **Nessun fondo intrappolato**: l'escrow non trattiene ETH tra le transazioni (`pay` distribuisce tutto nella stessa tx; a fine tx `balance == 0`, `test_PaySettlesAtomically`); lo split trattiene solo i saldi ritirabili.
- ✅ **Rimborsi/chargeback**: gestiti off-chain (backend `refundOrder` → `revoked`); un biglietto revocato o **bruciato** non è valido al varco (`validate` → `FAKE`/`DUPLICATE`).

## FASE G — Rischi trovati, fix, domande aperte

### Rischi trovati e **corretti** in questo ciclo
- 🟡 (Medio) **Export su biglietto usato**: nel modello pre-burn l'export era gated su `used`, incompatibile con la nuova regola "usato = bruciato". **Fix**: `_requireExportable` ora richiede token **non usato** + **evento concluso** (mero NFT sopravvissuto); i biglietti usati normali non esistono più. Test aggiornati.
- 🟡 (Medio) **Burn di un token in vendita**: `markUsed` era owner-agnostico → un `validatorOperator` poteva bruciare un token detenuto dall'escrow (biglietto in listing). **Fix**: guard `if (isSaleOperator[holder]) revert TokenInEscrow()` in `markUsed` (`test_MarkUsed_RevertsWhileListed`).
- 🟢 (Basso) **Fee di rivendita bloccabile** se `platformTreasury` non impostata. **Fix**: fallback allo split in `resaleRoyaltyReceiver`.

### Domande aperte per l'auditor esterno (decisioni non prese da Code)
1. **`mintSpecial` fuori dal limite 3/evento**: i Signature 1/1 non incrementano `heldCount` (non sono biglietti d'ingresso). Confermare che non apra un vettore di aggiramento (mint massivo di "special" a un'identità). Mitigazione attuale: `mintSpecial` è `onlyOwner`.
2. **Timing `eventEndOf`**: la fee condizionale e l'export dipendono da `setEventEnd` impostato correttamente dal backend. Valutare un default/guardia se non impostato (oggi: non impostato = biglietto sempre "attivo").
4. **EIP-2981 vs receiver condizionale**: marketplace terzi che leggono `royaltyInfo` pagherebbero sempre lo split (0,5/0,5), non il 100% TINFT del biglietto attivo. Il 100%-TINFT vale solo sul percorso `TinftEscrow`. Confermare che sia il comportamento voluto (le vendite fuori dall'escrow sono comunque bloccate dalla policy 721C finché il token è bound).

### Voci rimandate all'audit esterno
- Analisi formale/simbolica (Slither/Mythril/Echidna) sui percorsi di fondi.
- Fuzzing esteso su sequenze mint→sale→burn→export con più identità.
- Revisione dei rami branch scoperti (Escrow 73% branch, Split funcs 83%).

---

## Definition of done
- ✅ Nessun rischio **Alto** aperto. Rischi Medio/Basso trovati → **corretti**. Restano 4 **domande aperte** documentate per l'auditor.
- ✅ `forge test` **92/92 verde**; coverage **97.86%** lines; gas-report acquisito.
- ⚠️ **Mainnet SOLO dopo audit indipendente di terza parte.** I 3 task (tetto +5%, fee 1% TINFT, burn) vanno auditati **insieme** e i contratti **rideployati** (l'indirizzo su Base Sepolia è la versione precedente).
