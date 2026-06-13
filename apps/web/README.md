# TINFT — Web (frontend)

## `demo.html` — demo visibile (autonoma)
Pagina **autonoma, zero dipendenze**: si apre con doppio click in qualsiasi browser.
Ricrea la superficie **cliente** TINFT (Eventi · Biglietti · Mercato) + una **Console**
con i ricavi che si aggiornano **live** a ogni azione.

Applica la **logica economica reale** — la stessa di `services/api/src/domain/rules.ts` e dei
contratti M1–M5:
- royalty **1%** del prezzo originale, split **0,5% TINFT + 0,5% organizzatore**
- tetto rivendita **+5%** sul costo base
- limite **2 biglietti per evento / identità**
- export: **free** (fee 25% → liberamente trasferibile) / **enforced** (royalty per sempre)
- commissione primario **5%**

Flusso dimostrato: acquista → (limite 2/evento) → valida al varco (→ collectible) →
rivendi col tetto +5% (royalty 0,5/0,5) → esporta. La Console riflette gli incassi in tempo reale.

Apri: `apps/web/demo.html`.

> È la base di partenza per l'app **Next.js** reale (M9), che consumerà l'API di `services/api`.
