# Fantaden — Asta & Quotazioni Fantacalcio

Tool personale per gestire l'asta del fantacalcio: combina l'aggiornamento
automatico delle quotazioni di Serie A con un motore di gestione asta live,
e ci aggiunge il pezzo che di solito si faceva a mano su Excel — una lista
di scelte **divisa in fasce**, ricavata incrociando le quotazioni correnti
con le statistiche della stagione precedente.

Il progetto si ispira a tre repository (nessun codice copiato, solo idee
reimplementate):

- **[bqit/fantaleghe-api-json](https://github.com/bqit/fantaleghe-api-json)** —
  per l'idea di scaricare l'Excel ufficiale delle quotazioni da
  fantacalcio.it e convertirlo in JSON via GitHub Actions.
- **[renzullicarmine-ai/FantAsta-Fantacalcio](https://github.com/renzullicarmine-ai/FantAsta-Fantacalcio)** —
  per la matematica del budget d'asta (allocazione dinamica per reparto,
  tesoretto bidirezionale, Max Strategica / Max ALL-IN).
- **[supermik1988/fantacalcio-mantra](https://github.com/supermik1988/fantacalcio-mantra)** —
  per l'idea del "Campo" Mantra: schierare la rosa su un campo e vedere
  quali moduli copre. Repo pubblico ma **senza licenza** (quindi nessun
  permesso di riuso del codice) e con uno stack diverso dal nostro
  (React/TypeScript/Tailwind): qui è tutto riscritto in vanilla JS. La
  tabella moduli→ruoli è il regolamento Mantra di fantacalcio.it e il
  matching bipartito è un algoritmo classico da manuale.

## Come funziona (in breve)

```
fantacalcio.it (Excel quotazioni + statistiche)
        │  scripts/fetch_fantacalcio.py   (richiede un cookie di sessione)
        ▼
data/raw/*.xlsx
        │  scripts/normalize.py
        ▼
data/quotazioni.json + data/statistiche.json
        │  scripts/build_board.py   (score percentile, fasce, indice affare)
        ▼
web/data/board.json + web/data/meta.json
        │  scripts/snapshot_history.py (ogni run aggiunge un punto storico)
        ▼
web/data/history.json
        │  scripts/export_xlsx.py
        ▼
export/lista_asta.xlsx   +   web/  (dashboard statica, GitHub Pages o locale)
```

Una GitHub Action (`update-data.yml`) esegue tutta la pipeline ogni giorno
e committa i JSON aggiornati; un'altra (`pages.yml`) pubblica `web/` su
GitHub Pages a ogni push. Nessun backend: la dashboard è HTML/CSS/JS
statico, lo stato dell'asta (rosa, wishlist, rivali) vive in `localStorage`
del browser.

## Setup

### 1. Cookie di fantacalcio.it

Gli endpoint Excel di fantacalcio.it richiedono un utente loggato:

1. Vai su [fantacalcio.it](https://www.fantacalcio.it) e fai login.
2. Apri gli strumenti sviluppatore del browser (F12) → tab **Network**.
3. Ricarica la pagina "Quotazioni" e clicca su una qualsiasi richiesta verso
   `fantacalcio.it`.
4. Copia l'intero valore dell'header **Cookie** della richiesta.
5. Nel repo GitHub: **Settings → Secrets and variables → Actions → New
   repository secret**, nome `FANTACALCIO_COOKIE`, incolla il valore.

Il cookie scade periodicamente: se `update-data.yml` inizia a fallire con
un errore "risposta non è un file .xlsx valido", ripeti la procedura.

### 2. GitHub Pages

**Settings → Pages → Source: GitHub Actions**. Il workflow `pages.yml`
pubblica il contenuto di `web/` a ogni push (o a mano da **Actions → Deploy
Dashboard su GitHub Pages → Run workflow**).

### 3. Prima esecuzione dati

Lancia manualmente `update-data.yml` da **Actions** (pulsante "Run
workflow") per generare i JSON iniziali, invece di aspettare il cron delle
04:15 UTC.

## Uso in locale

```bash
pip install -r requirements.txt

# pipeline completa (serve FANTACALCIO_COOKIE nell'ambiente)
export FANTACALCIO_COOKIE="..."
python3 scripts/fetch_fantacalcio.py
python3 scripts/normalize.py
python3 scripts/build_board.py
python3 scripts/snapshot_history.py
python3 scripts/export_xlsx.py

# dashboard
python3 -m http.server -d web 8000
# apri http://localhost:8000
```

Senza cookie (o senza rete verso fantacalcio.it) puoi comunque lavorare
sulle **fixture di test**: sono binarie e non versionate nel repo, ma
completamente derivabili da `scripts/make_fixtures.py` (i test le
rigenerano già in automatico se mancano):

```bash
python3 scripts/make_fixtures.py
python3 scripts/normalize.py \
  --prices-file data/raw/quotazioni_fixture.xlsx \
  --stats-file data/raw/statistiche_fixture.xlsx
python3 scripts/build_board.py
```

In alternativa, se preferisci scaricare gli Excel a mano dal sito
(Quotazioni → Esporta Excel, Statistiche → Esporta Excel), salvali come
`data/raw/quotazioni.xlsx` e `data/raw/statistiche.xlsx` e lancia
`normalize.py` senza argomenti.

## Personalizzare fasce e punteggi

- **`config/settings.json`** — id stagione fantacalcio.it, budget/slot/percentuali
  di default per l'asta. Gli id stagione vanno **verificati a inizio
  campionato**: apri la richiesta XHR verso `/api/v1/Excel/prices/{id}/1`
  dagli strumenti sviluppatore e leggi l'id lì.
- **`config/scoring.json`** — pesi dello score per ruolo (fantamedia,
  presenze, gol, assist, ...) e soglie percentili per le 6 fasce (Top, 1a,
  2a, 3a, Low Cost, Scommessa), anche per ruolo.
- **`config/overrides.json`** — override manuali per singolo giocatore
  (chiave = id, da `web/data/board.json`): fascia forzata, stelle, note,
  o `"escluso": true` per toglierlo dalla board (es. infortunio lungo).

Dopo una modifica a `scoring.json` o `overrides.json` rilancia
`python3 scripts/build_board.py` (e `export_xlsx.py` se vuoi anche
l'Excel aggiornato).

### Come si legge la board

Ogni giocatore ha:
- **`fascia`** — livello di prezzo, calcolato sul percentile di FVM dentro
  il ruolo (indipendente dalle statistiche: anche i neopromossi senza
  storico hanno una fascia, basata solo su quanto li quota il mercato).
- **`score`** (0–100) — percentile delle prestazioni stagione precedente
  dentro il ruolo. `null` per chi non ha statistiche (`no_stats: true`,
  tipicamente neopromossi o nuovi arrivi dall'estero).
- **`indice_affare`** e **`affare_label`** (Affare / Equo / Trappola) —
  confronto tra percentile di score e percentile di prezzo: un giocatore
  con statistiche migliori di quanto costi è un "Affare", il contrario è
  una "Trappola".
- **`fvm`** è il valore grezzo dell'Excel di fantacalcio.it, calibrato su
  una lega da **1000 crediti** (`fvm_reference_budget` in `config/settings.json`).
  **`fvm_500`** è lo stesso valore riparametrato sul budget di lega
  configurato (`auction_defaults.budget_totale`, di norma 500): è quello
  utile per leggere direttamente "quanto vale indicativamente questo
  giocatore nella mia asta". È una semplice trasformazione lineare
  (`fvm * budget_totale / fvm_reference_budget`): non influenza fascia,
  score o indice affare, calcolati tutti sul valore grezzo `fvm`.

### Score multi-stagione

Con `config/scoring.json` → `multi_season.enabled: true` (attivo di default),
lo `score` non si basa più sulla sola stagione precedente ma su una media
pesata delle stagioni in `config/settings.json` → `season.stats_season_ids`
(dalla più recente, pesi in `multi_season.weights`, es. `[0.60, 0.25, 0.15]`
= ultima stagione dominante ma non sola). Una stagione con presenze sotto
`min_presenze_per_season` (cameo per infortunio) conta come "disponibile" ma
è esclusa dalla media — a meno che sia l'unica che il giocatore ha, nel
qual caso si usa comunque quella piuttosto che dichiararlo senza statistiche.

Campi aggiuntivi sul giocatore quando è attivo:
- **`stagioni_disponibili`** / **`stagioni_ids`** — quante e quali stagioni
  hanno contribuito (mostrato come apice `×N` accanto a Pv in dashboard).
- **`trend_fantamedia`** — fantamedia più recente meno la media pesata delle
  precedenti (freccia ▲/▼/▬ accanto a Fm); `null` con una sola stagione.
- **`fantamedia_by_season`**, **`presenze_medie`**, **`continuita`** (media
  presenze/38 sulle stagioni disponibili).
- **`no_stats`** ora significa "nessuna statistica in nessuna stagione
  configurata" (prima: solo nell'ultima). **`no_stats_recent`** copre invece
  il vecchio significato (assente solo nell'ultima) ed è il campo che pilota
  il badge "NEW" in tabella — un giocatore rientrato da un prestito estero
  con storico solo più vecchio ha `no_stats: false` ma `no_stats_recent: true`.

Per tornare al comportamento a singola stagione: `multi_season.enabled: false`
in `config/scoring.json` (il resto della pipeline non cambia, i campi sopra
spariscono semplicemente dalla board).

## Dashboard — asta live

- Tabella filtrabile/ordinabile per ruolo, con sparkline della quotazione.
- Azioni per giocatore: ⭐ wishlist (prezzo base/target), 🛒 preso da me,
  🚫 preso da un rivale, ↩️ reset.
- Motore budget (`web/js/auction.js`): allocazione dinamica per reparto,
  tesoretto bidirezionale, Max Strategica e Max ALL-IN — ricalcolati a ogni
  azione.
- Pannello rivali: budget/slot residui e puntata massima teorica di ogni
  avversario, ricavati dai giocatori che segni come "presi da altri".
- Pannello movimenti: rialzi/ribassi di quotazione negli ultimi 3 giorni
  (`MOVEMENT_WINDOW_DAYS` in `web/js/history.js`), dagli snapshot storici.
- **Esporta/Importa stato** in JSON per fare backup o passare da un
  dispositivo all'altro (lo stato normalmente vive solo nel browser).

## Test

```bash
# logica di scoring/fasce/normalizzazione (Python)
pip install -r requirements.txt
pytest

# motore budget d'asta, storico movimenti e piano d'asta (Node, richiede Node 18+)
node --test tests/*.mjs
```

## Struttura del repo

```
config/    settings.json, scoring.json, overrides.json
scripts/   pipeline dati (fetch → normalize → build_board → snapshot_history → export_xlsx)
data/      quotazioni.json, statistiche.json, raw/ (Excel grezzi + fixture di test)
web/       dashboard statica (index.html, css/, js/, data/)
export/    lista_asta.xlsx generato
tests/     pytest (Python) + node --test (JS)
.github/workflows/  update-data.yml, pages.yml
```

## Limiti noti

- Gli endpoint `fantacalcio.it/api/v1/Excel/...` non sono documentati
  ufficialmente: se il sito cambia struttura, `fetch_fantacalcio.py` inizia
  a fallire con un errore esplicito (non scrive mai dati parziali).
- L'endpoint statistiche è `/api/v1/Excel/stats/{season_id}/1` (nota: `stats`,
  non `statistics` come l'analoga richiesta delle quotazioni) — se
  fantacalcio.it cambia ancora struttura e torna a rispondere 404, il
  download delle statistiche fallisce in modo "silenzioso" (la pipeline
  prosegue comunque, con tutti i giocatori in `no_stats`) mentre quello delle
  quotazioni resta obbligatorio e blocca tutto. Per ritrovare l'URL corretto:
  pagina "Statistiche" su fantacalcio.it da loggato → strumenti sviluppatore
  → tab Network → clicca il pulsante di download → cerca la richiesta verso
  `fantacalcio.it` (da mobile: tieni premuto sul link di download per
  "Copia indirizzo").
- Il pannello rivali assume che tutti seguano lo stesso regolamento di slot
  della propria lega (`config/settings.json` → `auction_defaults.slot`).
- Lo stato dell'asta vive solo in `localStorage`: usa "Esporta stato" prima
  di cambiare browser/dispositivo o svuotare la cache.
