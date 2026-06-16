# TINFT — Sicurezza & preparazione all'audit (contratti)

> Stato: hardening interno completato (pre-audit). L'**audit esterno indipendente
> (M10) resta obbligatorio prima di qualsiasi deploy su mainnet.** Questo documento
> è il punto di partenza per gli auditor e la traccia delle decisioni di sicurezza.

## 1. Ambito
Contratti in `contracts/src` (Solidity 0.8.28, OpenZeppelin 5.6.1):

| Contratto | Responsabilità |
|---|---|
| `TinftTicket` | ERC-721 + EIP-2981; policy di trasferimento (ERC-721C), royalty 1%, anti-bagarinaggio (tetto +10%, limite 3/evento), validazione ed export. |
| `TinftTransferValidator` | Allowlist di operatori; gate di ogni trasferimento di token vincolato. |
| `TinftRoyaltySplit` | Ripartizione royalty 0,5/0,5 (pull-payment). |
| `TinftEscrow` | Vendita P2P con escrow (list/pay/reclaim/cancel), Pausable. |

## 2. Modello di fiducia e ruoli privilegiati
La piattaforma è **custodial** per design: TINFT è custode degli asset e opera i
wallet (account abstraction). I poteri privilegiati sono quindi previsti, ma minimizzati.

| Ruolo | Detenuto da | Poteri | Mitigazione |
|---|---|---|---|
| `owner` (ticket/validator/escrow) | TINFT | mint, set operatori/identità/treasury/validator, pause | **Ownable2Step** (no perdita per indirizzo errato); **raccomandato multisig + timelock** |
| sale operator | escrow | `recordSale` (costo base + conteggio 3/evento) | solo contratti TINFT in allowlist |
| validator operator | backend validatore | `markUsed` | solo indirizzi in allowlist |
| identity registrar (owner) | backend (post-SPID) | `setIdentity` (solo `hash(CF)`) | nessun dato personale on-chain |

**Centralizzazione (nota per l'audit):** l'owner può coniare, pausare il trading e
impostare identità/operatori. È coerente col modello custodial. Raccomandazione:
owner = **multisig** (es. Safe) con **timelock** sulle funzioni amministrative.

## 3. Proprietà di sicurezza garantite (e testate)
- **Royalty enforced**: i token vincolati si muovono solo via operatori in allowlist;
  un trasferimento diretto fa revert. La royalty 1% (0,5/0,5) è trattenuta dall'escrow.
- **Conservazione fondi nello split**: `pending[TINFT] + pending[ORGANIZER] == totalReceived`
  (fuzz). Ricezione senza chiamate esterne → non può fallire/bloccarsi.
- **Escrow non intrappola mai i token**: `reclaim` (a timeout, da chiunque) e `cancel`
  (venditore) **non sono sospendibili**; anche a contratto in pausa il token torna
  sempre al venditore.
- **Atomicità della vendita**: `pay` trasferisce token, prezzo e royalty in un'unica tx;
  ogni fallimento fa revert senza stati intermedi.
- **Anti-bagarinaggio senza bypass**: il conteggio 3/evento non si abbassa al `list`
  → niente trucco list→compra→reclaim; `reclaim`/`cancel` non toccano i conteggi → niente stallo.
- **Reentrancy**: `nonReentrant` + checks-effects-interactions su `escrow.{list,pay,reclaim,cancel}`,
  `ticket.exportFree`, `split.withdraw`. Test dedicati: venditore malevolo e tesoreria malevola
  non rubano né corrompono lo stato.

## 4. Assunzioni e decisioni di design (da validare in audit)
- **Wallet utente registrati**: il limite 3/evento si applica solo a indirizzi con
  `identityOf != 0`. I wallet non registrati (es. contratti di sistema, escrow) sono
  esenti: il backend DEVE registrare ogni wallet cliente prima del mint/acquisto.
- **`hash(CF)` off-chain**: on-chain solo `keccak256(CF + salt)`; il salt e il CF in
  chiaro restano off-chain cifrati (GDPR). La robustezza anti-multiaccount dipende da SPID.
- **Regolamento in valuta nativa**: M1–M5 usano ETH nativo. Il regolamento reale in
  euro/stablecoin è del backend pagamenti (M7); valutare variante ERC-20 dell'escrow/split.
- **Arrotondamenti fiat**: royalty/fee on-chain in unità intere; l'arrotondamento al
  centesimo è una decisione fiscale gestita off-chain (cfr. `docs/SPEC-VERIFICATA.md` Q1).
- **EIP-2981 dopo `exportFree`**: il token esce dalla policy ma EIP-2981 resta dichiarata
  (royalty *best-effort*), come da spec §8(A).
- **`onlyOwner mint`**: l'emissione è centralizzata sul backend custodial (atteso).

## 5. Copertura test
65 test (`forge test`), inclusi fuzz (conservazione fondi, allowlist) e scenari di
attacco (reentrancy venditore/tesoreria). Coprono le DoD di M1–M5 e l'hardening.

## 6. Checklist per l'audit esterno (M10)
- [ ] Analisi statica: **Slither**, **Aderyn**; valutare **Mythril**/**Halmos**.
- [ ] Campagne **invariant/fuzz** (Foundry invariant): no-fondi-intrappolati nell'escrow,
      conservazione dello split, monotònia dei conteggi 3/evento.
- [ ] Revisione control-flow di `pay` (ordine effetti/interazioni, gestione `msg.value`).
- [ ] Verifica integrazione **ERC-721C / Transfer Validator** sui marketplace target di Base.
- [ ] Gestione upgrade/immutabilità: i contratti sono **non-upgradeable**; confermare
      strategia di migrazione e ownership (multisig + timelock).
- [ ] Gas/DoS: limiti su loop (assenti), griefing su `reclaim` pubblico (benigno).
- [ ] Verifica deploy & wiring (operatori/treasury/validator) con `script/Deploy.s.sol`.

## 7. Fuori ambito (milestone successive)
Account abstraction/paymaster (custodia), PSP e on/off-ramp euro (M7), SPID/OIDC (M8),
metadata/`tokenURI` e flusso validazione completo (offline/QR) lato app (M9).
