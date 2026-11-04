# Fiere in Mappa

Sito: https://fiereinmappa.it

Sito web con la mappa interattiva delle fiere in Italia **in corso o che iniziano
entro 30 giorni**, filtrabile per regione, settore, tipologia e periodo
(in corso, prossimi 7 giorni, prossimi 30 giorni). Stile grafico: Parallax scrolling.

I dati vengono dal calendario ufficiale AEFI (https://www.aefi.it/it/calendario/).

## Com'è fatto il progetto

Il sito ha due pagine:
- **`index.html`** – la pagina iniziale: presenta la cartina e ha il pulsante "Apri la mappa"
- **`mappa.html`** – la cartina con filtri ed elenco delle fiere

| File | A cosa serve |
|------|--------------|
| `index.html` | La pagina iniziale (paesaggio in parallax, cosa offre la cartina, pulsante principale) |
| `mappa.html` | La pagina della cartina (testata, filtri, mappa, elenco a schede) |
| `style.css` | L'aspetto grafico di entrambe le pagine (colori, parallax, versione per telefono) |
| `comune.js` | Il codice usato da entrambe le pagine: effetto parallax, animazioni, date |
| `home.js` | Il codice della pagina iniziale (numero di fiere, disegno dell'Italia) |
| `app.js` | Il codice della cartina: carica i dati, disegna la mappa, applica i filtri |
| `data/fiere.json` | L'elenco delle fiere (creato automaticamente, non modificarlo a mano) |
| `data/regioni.geojson` | I confini delle 20 regioni, versione leggera (pagina iniziale) |
| `data/regioni-dettaglio.geojson` | I confini precisi, usati dalla cartina (si vedono bene anche da vicino) |
| `strumenti/aggiorna_fiere.py` | Il programma che raccoglie le fiere dal sito AEFI |
| `avvia-sito.bat` | Doppio clic per vedere il sito sul proprio computer |
| `strumenti/server_locale.py` | Il piccolo server usato da `avvia-sito.bat` (impedisce al browser di mostrare versioni vecchie) |
| `strumenti/prepara_regioni.py` | Il programma che ha creato `regioni.geojson` (serve una volta sola) |
| `NOTE-PROGETTO.md` | Decisioni prese e lista delle cose da fare |
| `REGISTRO-LAVORI.md` | Tutti i passaggi fatti sul progetto, giorno per giorno |
| `catture/` | Catture dello schermo usate durante il lavoro (non fanno parte del sito) |
| `strumenti/cache_schede.json` | Memoria del programma, per essere più veloce la volta dopo |
| `.github/workflows/aggiorna-e-pubblica.yml` | L'aggiornamento automatico di ogni giorno e la pubblicazione del sito |

## Vedere il sito sul proprio computer

Il sito legge il file `data/fiere.json`, e i browser non lo permettono se si apre
`index.html` con un doppio clic. Serve un piccolo "server" locale.

**Il modo più semplice:** doppio clic su `avvia-sito.bat`. Si apre una finestra nera
(il server) e il browser con la pagina. Per spegnere, chiudi la finestra nera.

In alternativa, a mano:

1. Apri PowerShell nella cartella `mappa-fiere`
2. Scrivi: `python -m http.server 8000`
3. Apri il browser su http://localhost:8000
4. Per fermarlo: premi `Ctrl + C` in PowerShell

## Aggiornare le fiere a mano

```
python strumenti/aggiorna_fiere.py
```

## Correggere a mano i dati di una fiera

Se AEFI non indica il sito di una fiera (o ne sbaglia il luogo), si aggiunge una riga
alla tabella `CORREZIONI_FIERE` all'inizio di `strumenti/aggiorna_fiere.py`, per esempio:

```python
"merano winefestival": {"sito": "https://meranowinefestival.com/"},
```

La chiave è il nome della fiera in minuscolo: la correzione vale per tutte le edizioni.
Alla fine di ogni raccolta il programma elenca le fiere ancora senza sito.

## Link a una regione o città

I filtri finiscono nell'indirizzo della pagina della cartina, quindi si possono condividere link come:

- `.../mappa.html#regione=Veneto`
- `.../mappa.html#regione=Lombardia&testo=Milano`
- `.../mappa.html#periodo=settimana&tipologia=Internazionale`

## Quando si modifica un file

Nelle pagine HTML, `style.css` e i file `.js` sono richiamati con un numero di versione
(es. `app.js?v=2026-10-07-parallax`). Dopo una modifica conviene cambiare quel numero
in **tutte e due** le pagine: così chi visita il sito scarica subito la versione nuova.

## Online e aggiornamento automatico

Il sito è pubblicato con **GitHub Pages** dall'automatismo `.github/workflows/aggiorna-e-pubblica.yml`:

- **ogni giorno** (alle 4:00 di Greenwich) raccoglie le fiere da AEFI, salva il nuovo
  `data/fiere.json` nell'archivio e ripubblica il sito, senza bisogno di approvazioni;
- **ogni volta che si caricano modifiche** (push) ripubblica subito il sito;
- si può avviare anche a mano: scheda **Actions → Aggiorna fiere e pubblica il sito → Run workflow**.

Sul sito vanno solo i file delle pagine (html, css, js, `data/`, `icone/`), non `strumenti/`.
Se AEFI non risponde o trova meno della metà delle fiere del giorno prima, il programma
si ferma senza toccare l'elenco e GitHub manda un'email di avviso.

L'app Android non ha dati suoi: scarica `data/fiere.json` da https://fiereinmappa.it.

## Nota sui dati

Il calendario AEFI è la fonte più completa disponibile, ma non contiene proprio tutte
le fiere italiane e le date possono cambiare. Ogni fiera sul sito ha il link alla
scheda AEFI e al sito ufficiale per la verifica.
