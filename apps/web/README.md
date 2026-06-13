# TINFT — Web (frontend)

## `demo.html` — WebApp a dashboard (autonoma, visibile)
Singolo file, **zero dipendenze**: si apre in qualsiasi browser. Layout a **dashboard**
con sidebar e **profilo selezionabile** — ogni utente ha la sua dashboard dedicata:

- **Organizzatore**: panoramica (club, eventi, venduti, incasso, royalty) · **Club & Eventi**:
  crea club, **entra nel club** ed entra in una sezione dedicata per **creare gli eventi** del club.
- **Cliente**: **Esplora** club → eventi del club + **Fidelity del club** (carnet associato al CLUB,
  valido su tutti i suoi eventi) · **I miei biglietti** (check-in QR rotante, vendi→escrow con timer,
  regala, esporta).
- **Validatore**: scansione con i 5 esiti; il Fidelity consuma un ingresso alla volta.

**Modello**: l'organizzatore ha **più club**; ogni club ha i suoi **eventi**; il **Fidelity è del club**.

Applica le **regole reali** (royalty 1% 0,5/0,5, tetto +5%, limite 2/evento, fee export 25%,
commissione primario 5%) — le stesse di `services/api/src/domain/rules.ts` e dei contratti M1–M5.
La barra in alto mostra i **ricavi piattaforma** live.

Apri: `apps/web/demo.html`.

## In arrivo
- **Sito Web pubblico** (HTML): vetrina + acquisto che deposita il biglietto nel wallet.
- Conversione in app **Next.js** reale collegata all'API di `services/api`.
