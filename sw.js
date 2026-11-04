/* ============================================================
   sw.js – il "service worker" dell'app
   ------------------------------------------------------------
   È un piccolo programma che il telefono tiene acceso in disparte.
   Serve a due cose:
     1. rendere il sito installabile come app (Android lo richiede);
     2. far aprire l'app anche senza rete, mostrando gli ultimi dati scaricati.

   Regola scelta: "prima la rete". Se c'è internet si scarica SEMPRE la
   versione nuova (così le fiere sono quelle aggiornate ogni settimana)
   e se ne tiene una copia; solo se manca la rete si usa la copia.

   Le tessere della cartina di OpenStreetMap NON vengono conservate:
   le regole di OpenStreetMap chiedono di non farne copie.
   ============================================================ */

// Quando cambia l'elenco qui sotto, cambia anche questo nome: le copie vecchie vengono buttate
const NOME_CACHE = "fiere-in-italia-v1";

// I file da tenere pronti fin dall'installazione
const FILE_DEL_SITO = [
  "./",
  "index.html",
  "mappa.html",
  "style.css",
  "comune.js",
  "home.js",
  "app.js",
  "news.js",
  "banda.js",
  "manifest.json",
  "data/fiere.json",
  "data/riassunti.json",
  "data/news.json",
  "data/regioni.geojson",
  "data/regioni-dettaglio.geojson",
  "icone/icona-192.png",
  "icone/icona-512.png"
];

// Installazione: scarichiamo i file del sito una prima volta
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE).then((cache) => cache.addAll(FILE_DEL_SITO))
  );
  self.skipWaiting();   // la nuova versione entra in funzione subito
});

// Attivazione: buttiamo le copie delle versioni vecchie
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomi) =>
      Promise.all(nomi.filter((n) => n !== NOME_CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Ogni volta che la pagina chiede un file
self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;

  const indirizzo = new URL(richiesta.url);
  const nostroSito = indirizzo.origin === self.location.origin;
  // Librerie e caratteri da internet (Leaflet, MarkerCluster, Google Fonts)
  const libreria = /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(indirizzo.host);
  // Tutto il resto (es. tessere di OpenStreetMap) passa senza essere toccato
  if (!nostroSito && !libreria) return;

  evento.respondWith(
    fetch(richiesta)
      .then((risposta) => {
        // Arrivata dalla rete: ne teniamo una copia per quando la rete manca
        if (risposta.ok || risposta.type === "opaque") {
          const copia = risposta.clone();
          caches.open(NOME_CACHE).then((cache) => cache.put(richiesta, copia));
        }
        return risposta;
      })
      .catch(async () => {
        // Niente rete: usiamo la copia (ignorando il "?v=..." nell'indirizzo)
        const copia = await caches.match(richiesta, { ignoreSearch: true });
        if (copia) return copia;
        // Una pagina mai vista: mostriamo la pagina iniziale
        if (richiesta.mode === "navigate") {
          const casa = await caches.match("index.html");
          if (casa) return casa;
        }
        return Response.error();
      })
  );
});
