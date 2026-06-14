# Handoff: TINFT — Ticketing NFT (Sito Web · Web App · App nativa · Console)

## Overview
TINFT è una piattaforma di biglietteria basata su NFT nominativi. Vincolo di prodotto centrale: **ogni processo operativo (acquisto, validazione, trasferimento, controllo accessi) deve passare solo da smartphone tramite l'app proprietaria TINFT — nessun device esterno** (niente lettori, tornelli o scanner dedicati). Il web serve a vedere/gestire il proprio account e a comprare; la **validazione degli ingressi avviene esclusivamente nell'app**.

Il sistema ha quattro superfici che condividono lo stesso "mondo" dati:
1. **Sito Web** — vetrina pubblica + acquisto + registrazione.
2. **Web App** — area cliente loggata (desktop/web).
3. **Prototipo App** — app mobile (cliente + organizzatore + validatore + admin TINFT).
4. **Console Web** — pannello organizzatore (gestione club, eventi, incassi, accessi in sola lettura).

## About the Design Files
I file `.dc.html` in questo bundle sono **riferimenti di design realizzati in HTML** — prototipi che mostrano aspetto e comportamento previsti, **non codice di produzione da copiare**. Il compito è **ricreare questi design nell'ambiente del codebase di destinazione** (React/Vue/SwiftUI/native) usando i pattern e le librerie già in uso — oppure, se non esiste ancora un ambiente, scegliere il framework più adatto. Per la parte di validazione/NFC l'app deve essere **nativa** (una PWA non basta).

I prototipi usano un runtime proprietario (`support.js` + tag `<x-dc>`): è solo l'impalcatura del prototipo, non va portata in produzione. Conta il design renderizzato e la logica descritta qui sotto.

## Fidelity
**High-fidelity (hifi).** Colori, tipografia, spaziature, raggi e interazioni sono definitivi. Ricreare la UI fedelmente con le librerie del codebase. La logica di business (escrow, royalty, KPI) è già modellata nei prototipi e va reimplementata lato backend (vedi `TINFT - Specifica Tecnica`).

## Design Tokens
**Colori**
- Sfondo base: `#0a0a0a` · superfici: `#131313`, `#1c1c1c` · bordi: `#2a2a2a`, `#222222`
- Testo: `#e8e6e0` (primario), `#8a8682` / `#6a6764` (muted), `#5a5754` (faint)
- Accento blu (brand): `#4472c4`; varianti `#6f9eff` (chiaro), `#aac3f5`, `#2f4f8a` (bordo)
- Successo/verde: `#00cc88`, `#5fe0b0`, `#0a8a5c`, `#0a3f30` (bg)
- Warning/oro: `#ffcf80`, `#9c5e00`
- Errore/rosa: `#ff8aa0`, `#ff5577`
- Su documento stampabile (Specifica): paper `#fff`, body bg `#efece3`, ink `#1a1d24`, accento `#2f5fb0`

**Tipografia**
- Display/heading: **Quicksand** (500/600/700)
- Body UI: system sans (nel prototipo è il default del runtime)
- Documento tecnico: **IBM Plex Sans** (body) + **IBM Plex Mono** (codice)
- Scale tipiche: H1 24–34px, titoli sezione 22px, body 13–14px, label/kicker 9–11px uppercase con `letter-spacing:0.08–0.14em`

**Forma**
- Border-radius: **13px** su card/pulsanti/campi/contenitori; **9px** immagini; cerchi 50% per avatar
- Shadow accento: `0 0 18–30px rgba(68,114,196,.3)` (CTA blu), glow verde `rgba(0,204,136,.16)`
- Spaziatura: padding card 12–20px, gap 1px (liste a celle separate da bordo) / 8–16px (griglie)

## Screens / Views

### Sito Web (pubblico)
- **Hero + catalogo eventi**: griglia card evento (cover, tipo uppercase, titolo, venue·città, prezzo "da €", CTA Dettagli/Acquista). Gli eventi includono sia il catalogo fisso sia quelli creati dagli organizzatori nei club (mondo condiviso).
- **Artisti da seguire**: griglia card (avatar iniziali colorato, nome, genere, bottone Segui).
- **Dal blog**: card (cover placeholder a righe, tag·tempo lettura, titolo, estratto). *Contenuti placeholder, da sostituire.*
- **News & annunci**: lista righe (data + titolo).
- **Sezione organizzatori** + **modale Auth** (vedi Interazioni → Registrazione).

### Web App (area cliente loggata)
Nav laterale a **7 voci separate**: Home, Eventi, Biglietti, Mercato, Artisti, Blog, News.
- **Home**: saluto, alert "biglietto in arrivo" (escrow), 3 stat card (Portafoglio/Goodwill/In vendita), In evidenza, Consigliati per te.
- **Eventi**: striscia statistiche (in vendita/città/prezzo minimo) + griglia eventi.
- **Biglietti**: striscia statistiche (attivi/validati/in vendita/spesa totale) + lista biglietti con stati (attivo/usato/vendita/exported) e azioni Entra/Rivendi/Trasferisci.
- **Mercato**: striscia statistiche + lista rivendite acquistabili (con royalty e tetto prezzo).
- **Artisti / Blog / News**: **sezioni separate**, ciascuna con la propria striscia statistiche in cima.

### Prototipo App (mobile)
Bottom-nav cliente a **5 voci**: Home, Eventi, Biglietti, Mercato, **Scopri**.
- **Scopri** contiene Artisti/Blog/News come **sotto-sezioni** (segmented control), ognuna con striscia statistiche. *(Scelta mobile: 7 voci in bottom-nav non sono usabili; le sezioni restano separate sotto Scopri.)*
- Profili multipli: **Cliente**, **Organizzatore** (Home/Club/Eventi/Incassi/Accessi/Holder), **Validatore** (scansione/validazione ingressi — solo app), **Admin TINFT**.
- **Club → Eventi**: l'organizzatore crea pagine-club (con dati societari/fatturazione) e dentro crea eventi; finiscono nel mondo condiviso e diventano acquistabili su tutte le superfici.

### Console Web (organizzatore)
Nav: Dashboard, Club, Eventi, Incassi, Accessi, Holder.
- **Dashboard**: KPI (incasso, biglietti, eventi, validati) = baseline demo + delta reale dal mondo condiviso.
- **Club**: lista club → dettaglio con eventi e creazione evento.
- **Accessi**: validazioni in **sola lettura** (la validazione avviene nell'app, mai dal web).
- **Incassi & payout**: lordo, commissioni, royalty, netto, prossimo bonifico.

## Interactions & Behavior

### Registrazione (identica su tutte le superfici)
**Due registrazioni separate per due utenti distinti** (Cliente e Organizzatore), con **gli stessi dati personali**: nome, cognome, codice fiscale, data di nascita, email, telefono, indirizzo di residenza, indirizzo di fatturazione (toggle "uguale a residenza"), nome utente, password.
- Due percorsi: **SPID** (dati già verificati, nessun codice) ed **Email** (stessi campi + verifica con codice OTP a 6 cifre).
- L'organizzatore, alla creazione del **club**, fornisce inoltre i **dati societari/fatturazione**: ragione sociale, P.IVA, sede legale, PEC/email fatturazione, codice SDI, IBAN.
- Vincolo: una sola identità per codice fiscale (limite 2 biglietti/evento legato all'identità).

### Trasferimento biglietto in escrow
Regalo o vendita P2P: il biglietto resta **trattenuto in escrow** finché il destinatario non accetta (o scade e torna al mittente). In caso di pagamento, royalty divisa tra organizzatore e TINFT. Niente rimborso diretto: la rinuncia avviene solo rivendendo prima dell'evento.

### Validazione (solo app)
Stati biglietto: `attivo → usato` alla validazione. Nessuna superficie web valida ingressi. In produzione: QR dinamico firmato (rotazione ~30s) + modalità offline (vedi Specifica §8).

### Stati e transizioni chiave
- Ticket.status: `attivo | usato | vendita | exported`
- Transfer.status: `pending | escrow | done | expired | cancelled`
- Event.status: `bozza | in vendita | concluso`
- KYC organizzatore: `none → pending → verified → rejected` (gate alla pubblicazione eventi)

## State Management / Dati
I prototipi simulano un backend con un "mondo condiviso" in `localStorage` (chiave `tinft_world`: `{ tickets, transfers, accounts, clubs }`) + sessione (`tinft_session`). **In produzione va sostituito da backend + DB reale** — entità, contratti API e modello completo nel documento **`TINFT - Specifica Tecnica`** (incluso in questo bundle come riferimento).

## Assets
In `assets/`: `ev-vol4.png`, `ev-live.png`, `ev-jazz.png` (cover eventi demo), `mesh.jpg`, `tinft-logo.png`. Le cover di blog/eventi-club sono placeholder SVG a righe generati a runtime. Sostituire con immagini reali. Font: Quicksand (UI), IBM Plex Sans/Mono (documento) — Google Fonts.

## Files
- `TINFT - Sito Web.dc.html` — sito pubblico
- `TINFT - Web App.dc.html` — area cliente web
- `TINFT - Prototipo App.dc.html` — app mobile (tutti i profili)
- `TINFT - Console Web.dc.html` — console organizzatore
- `TINFT - Specifica Tecnica.dc.html` — specifica tecnica / requisiti backend (i 10 workstream di produzione)
- `support.js` — runtime del prototipo (NON portare in produzione)
- `assets/` — immagini demo

> Per aprire i prototipi: servire la cartella con un server statico e aprire i singoli `.dc.html`. Sono riferimenti di design, non l'app finale.
