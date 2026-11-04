// =========================================================
// app.js – codice della pagina della cartina (mappa.html)
//   1. carica i confini delle regioni e l'elenco delle fiere
//   2. disegna SOLO l'Italia, che "galleggia" sul mare con un'ombra a rilievo
//      che si sposta seguendo il mouse (effetto 3D in stile parallax)
//   3. mette un pallino per ogni fiera e crea le schede dell'elenco
//   4. ridisegna tutto ogni volta che si cambia un filtro
// (parallax della pagina, animazioni e funzioni per le date sono in comune.js)
// =========================================================

// --- Riferimenti agli elementi della pagina ---
const campi = {
  testo: document.getElementById("filtro-testo"),
  regione: document.getElementById("filtro-regione"),
  settore: document.getElementById("filtro-settore"),
  tipologia: document.getElementById("filtro-tipologia"),
  periodo: document.getElementById("filtro-periodo"),
};
const elenco = document.getElementById("elenco");
const conteggio = document.getElementById("conteggio");
const schedaMappa = document.getElementById("scheda-mappa");

// Tutte le fiere dei prossimi 30 giorni (si riempie dopo il caricamento)
let tutteLeFiere = [];
// Numero di fiere per ogni regione (per i colori e i suggerimenti sopra le regioni)
let fierePerRegione = {};
// … e quante di queste sono in corso oggi (per colorare le bolle di arancione)
let inCorsoPerRegione = {};

// Legge un colore definito in style.css (es. "--terra"), così i colori stanno tutti in un posto
function colore(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}


// =========================================================
// La mappa: solo l'Italia
// =========================================================

// Il "rettangolo" che contiene tutta l'Italia, isole comprese
const ITALIA = L.latLngBounds([[35.4, 6.6], [47.1, 18.6]]);

const mappa = L.map("mappa", {
  zoomControl: false,
  zoomSnap: 0.25,            // passi fini: l'Italia intera riempie bene la scheda
  zoomDelta: 1.5,            // scatti ampi: ogni clic su + o − cambia di un livello e mezzo
  wheelPxPerZoomLevel: 50,   // la rotellina avvicina in fretta
  scrollWheelZoom: true,     // la rotellina ingrandisce subito, senza dover cliccare
  maxZoom: 16,               // da vicino si arriva alle singole strade
  // Cartina "ferma" (deciso dall'utente): non si sposta MAI da sola (nemmeno per mostrare
  // un cartellino) e le frecce della tastiera non la muovono. Si sposta solo se l'utente
  // la trascina con il mouse (clic, tieni premuto, muovi). Lo zoom funziona come prima.
  dragging: true,
  // Dopo il trascinamento la mappa "scivola" ancora un poco (inerzia), ma con una
  // velocità massima: così un gesto rapido non la lancia lontano dall'Italia
  inertiaMaxSpeed: 1200,
  keyboardPanDelta: 0,       // le frecce non spostano la mappa (i tasti + e − zoomano ancora)
  maxBounds: ITALIA.pad(0.12),   // trascinando non ci si allontana dall'Italia
  maxBoundsViscosity: 1,
});
L.control.zoom({ position: "topright", zoomInTitle: "Avvicina", zoomOutTitle: "Allontana" }).addTo(mappa);
mappa.attributionControl.setPrefix(false);
mappa.attributionControl.addAttribution(
  'Confini: <a href="https://www.istat.it" target="_blank" rel="noopener">ISTAT</a> / ' +
  '<a href="https://github.com/openpolis/geojson-italy" target="_blank" rel="noopener">openpolis</a>');

// Lo zoom minimo è quello che mostra l'Italia intera: non ci si può allontanare di più
function adattaZoomMinimo() {
  mappa.setMinZoom(mappa.getBoundsZoom(ITALIA));
}
mappa.fitBounds(ITALIA);
adattaZoomMinimo();
mappa.on("resize", adattaZoomMinimo);


// --- Mappa stradale sotto le regioni, ma solo dentro l'Italia ---
// Sotto le regioni c'è SEMPRE la cartina di OpenStreetMap con città e strade, con colori
// spenti (vedi .cartina-strade in style.css) così bolle e pallini risaltano.
// Una "maschera" color mare copre tutto ciò che sta fuori dall'Italia.
// SOGLIA_DETTAGLIO: da questo zoom in poi le bolle "per regione" lasciano il posto
// ai pallini delle singole fiere.
const SOGLIA_DETTAGLIO = 8;

mappa.createPane("cartina").style.zIndex = 250;     // sotto le regioni (che stanno a 400)
mappa.createPane("maschera").style.zIndex = 300;
mappa.getPane("maschera").style.pointerEvents = "none";

const cartinaStrade = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  pane: "cartina",
  maxZoom: 19,
  bounds: ITALIA.pad(0.12),    // la cartina stradale si carica solo attorno all'Italia
  className: "cartina-strade",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(mappa);

let maschera = null;

// La maschera è un rettangolo grande come il mondo, con dei "buchi" a forma di Italia
function creaMaschera(geojson) {
  const mondo = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
  const buchi = [];
  for (const regione of geojson.features) {
    for (const poligono of regione.geometry.coordinates) {
      buchi.push(poligono[0].map(([lng, lat]) => [lat, lng]));   // solo il contorno esterno
    }
  }
  // padding: 2 = la maschera viene disegnata molto più grande dello schermo (2 volte in
  // ogni direzione): trascinando o allontanando la mappa non compare mai il "ritaglio
  // grigio" della cartina stradale fuori dall'Italia (richiesta dell'utente)
  const disegno = L.svg({ pane: "maschera", padding: 2 });
  maschera = L.polygon([mondo, ...buchi], {
    pane: "maschera",
    renderer: disegno,
    stroke: false,
    fillColor: colore("--mare-piatto"),
    fillOpacity: 1,
    interactive: false,
  }).addTo(mappa);
}

// --- Le 20 regioni ---
let stratoRegioni = null;
let regioneSottoIlMouse = null;

// Aspetto di ogni regione: TRASPARENTE (si vede la mappa stradale sotto), con un bordo
// sottile. Sotto il cursore (o scelta dal menu) si colora appena; se è stata scelta
// una regione, le altre vengono "velate" per mettere in risalto quella scelta.
function stileRegione(regione) {
  const nome = regione.properties.nome;
  const scelta = campi.regione.value;
  const attiva = nome === scelta || nome === regioneSottoIlMouse;
  const velata = scelta && nome !== scelta;
  return {
    className: "regione",
    color: colore("--accento"),
    weight: attiva ? 2.5 : 1.2,
    opacity: attiva ? 0.85 : 0.45,
    lineJoin: "round",
    fillColor: velata ? colore("--velo") : colore("--accento"),
    fillOpacity: velata ? 0.55 : attiva ? 0.1 : 0,
  };
}

function aggiornaRegioni() {
  if (stratoRegioni) stratoRegioni.setStyle(stileRegione);
}

function disegnaRegioni(geojson) {
  stratoRegioni = L.geoJSON(geojson, {
    style: stileRegione,
    onEachFeature: (regione, forma) => {
      const nome = regione.properties.nome;
      // Suggerimento che segue il mouse: "Lombardia · 26 fiere nei prossimi 30 giorni".
      // Il numero rispetta i filtri scelti, quindi coincide con l'elenco di quella regione
      // Se ci sono sia fiere in corso sia fiere future, diciamo come si dividono
      // (es. "Lombardia · 27 fiere nei prossimi 30 giorni: 25 da iniziare, 2 in corso")
      forma.bindTooltip(() => {
        const n = fierePerRegione[nome] || 0;
        const nInCorso = inCorsoPerRegione[nome] || 0;
        const periodo = campi.periodo.selectedOptions[0]?.dataset.descrizione ?? "";
        const divisione = nInCorso && nInCorso < n ? `: ${n - nInCorso} da iniziare, ${nInCorso} in corso` : "";
        return `${nome} · ${n} ${n === 1 ? "fiera" : "fiere"} ${periodo}${divisione}`;
      }, { sticky: true, direction: "top", offset: [0, -10] });

      forma.on("mouseover", () => { regioneSottoIlMouse = nome; aggiornaRegioni(); });
      forma.on("mouseout", () => { regioneSottoIlMouse = null; aggiornaRegioni(); });

      // NB: il clic su una regione NON la sceglie (deciso dall'utente): in una regione
      // si entra solo scegliendola dal menu a tendina "Regione".

      // Il punto "centrale" della regione, dove mettere la sua bolla
      centriRegioni.set(nome, puntoInterno(regione.geometry.coordinates));
    },
  }).addTo(mappa);
}

// Trova un punto ben DENTRO una regione (non sul bordo e non fuori, cosa che può
// succedere con il semplice "centro" di regioni dalla forma irregolare).
// Proviamo una griglia di punti sul poligono più grande della regione e teniamo
// quello più lontano dai bordi.
function puntoInterno(poligoni) {
  const area = (anello) => Math.abs(anello.reduce((s, [x1, y1], i) => {
    const [x2, y2] = anello[(i + 1) % anello.length];
    return s + x1 * y2 - x2 * y1;
  }, 0)) / 2;
  const anello = poligoni.map((p) => p[0]).sort((a, b) => area(b) - area(a))[0];

  const dentro = (x, y) => {          // il punto (x, y) è dentro l'anello?
    let si = false;
    for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
      const [xi, yi] = anello[i], [xj, yj] = anello[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
    }
    return si;
  };

  const xs = anello.map((p) => p[0]), ys = anello.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const passi = 18;
  let migliore = null, distanzaMigliore = -1;
  for (let i = 1; i < passi; i++) {
    for (let j = 1; j < passi; j++) {
      const x = minX + ((maxX - minX) * i) / passi;
      const y = minY + ((maxY - minY) * j) / passi;
      if (!dentro(x, y)) continue;
      let vicino = Infinity;                       // distanza dal punto del bordo più vicino
      for (let k = 0; k < anello.length; k += 3) {
        const dx = (anello[k][0] - x) * 0.77, dy = anello[k][1] - y;
        vicino = Math.min(vicino, dx * dx + dy * dy);
      }
      if (vicino > distanzaMigliore) { distanzaMigliore = vicino; migliore = [y, x]; }
    }
  }
  return L.latLng(migliore || [(minY + maxY) / 2, (minX + maxX) / 2]);
}

// --- "Albero" delle fiere (si apre cliccando una bolla) ---
// L'albero lo disegniamo noi, AD ELENCO e con le didascalie: accanto alla bolla compare
// una colonna ordinata di righe; ogni riga ha il pallino della fiera (blu o arancione)
// e una didascalia con nome, date e città. Una linea parte dalla bolla e si dirama
// verso ogni riga, come in uno schema.
// L'elenco sta SEMPRE nella parte visibile della mappa: si apre a destra della bolla
// (o a sinistra, se a destra non c'è spazio) e su più colonne se le fiere sono tante.
// Mentre l'albero è aperto, tutto il resto sparisce.
const stratoAlbero = L.layerGroup().addTo(mappa);
let alberoAperto = false;
const ALTEZZA_RIGA = 46;         // pixel tra una riga e l'altra dell'elenco (righe ben separate)
const LARGHEZZA_VOCE = 272;      // larghezza di una riga (pallino + didascalia)
const SPAZIO_COLONNE = 18;       // spazio tra due colonne dell'elenco

function chiudiAlbero() {
  if (!alberoAperto) return;
  alberoAperto = false;
  stratoAlbero.clearLayers();
  mappa.closePopup();
  aggiornaEvidenza();
}

// Una riga dell'elenco: pallino + didascalia (nome, date, città).
// aSinistra = true quando l'elenco sta a sinistra della bolla: la didascalia va a
// sinistra del pallino, così i pallini restano dalla parte della bolla.
function iconaVoce(fiera, aSinistra) {
  const dettagli = `${formattaDate(fiera.inizio, fiera.fine)} · ${luogo(fiera)}`;
  return L.divIcon({
    className: "voce-albero in-evidenza" + (aSinistra ? " voce-sinistra" : ""),
    html: `<span class="punto${inCorso(fiera) ? " in-corso" : ""}"></span>
           <span class="voce-testo"><strong>${sicuro(fiera.nome)}</strong><small>${sicuro(dettagli)}</small></span>`,
    iconSize: [LARGHEZZA_VOCE, 36],
    iconAnchor: aSinistra ? [LARGHEZZA_VOCE - 13, 18] : [13, 18],   // il punto "vero" è il pallino
  });
}

// La parte di mappa davvero VISIBILE sullo schermo, in pixel della mappa:
// esclude ciò che sta sotto la barra in alto / la fascia dei filtri e ciò che esce
// dalla finestra (in basso o in alto)
function areaVisibileMappa() {
  const box = mappa.getContainer().getBoundingClientRect();
  const fascia = document.querySelector(".fascia-filtri");
  const barra = document.getElementById("barra-alta");
  let sopra = barra ? barra.getBoundingClientRect().bottom : 0;
  if (fascia && getComputedStyle(fascia).position === "sticky") sopra = Math.max(sopra, fascia.getBoundingClientRect().bottom);
  return {
    sinistra: 0,
    destra: box.width,
    alto: Math.max(0, sopra - box.top),
    basso: Math.min(box.height, innerHeight - box.top),
  };
}

// L'albero aperto adesso (serve per ridisegnarlo dopo uno zoom)
let alberoCorrente = null;           // { dove, fiere, arancione }

// Apre l'albero di un gruppo di fiere attorno al punto "dove" (la bolla cliccata)
function apriAlbero(dove, fiere, arancione) {
  chiudiAlbero();
  sganciaFiera();
  if (!fiere.length) return;
  alberoCorrente = { dove, fiere, arancione };
  disegnaAlbero(alberoCorrente);
  alberoAperto = true;
  aggiornaEvidenza();
}

// Disegna le righe dell'albero (senza toccare cartellini e fiera selezionata)
function disegnaAlbero({ dove, fiere, arancione }) {
  stratoAlbero.clearLayers();
  const area = areaVisibileMappa();
  const m = 12;                                          // margine dai bordi della mappa
  const limita = (valore, min, max) => (max < min ? min : Math.min(Math.max(valore, min), max));
  const pixelInLL = (x, y) => mappa.containerPointToLatLng(L.point(x, y));
  const classeColore = arancione ? " in-corso" : "";

  // 1. La bolla: al suo posto, ma dentro la parte visibile della mappa
  const raggioBolla = diametroBolla(fiere.length, false) / 2;
  const vero = mappa.latLngToContainerPoint(dove);
  const centro = L.point(
    limita(vero.x, area.sinistra + raggioBolla + m, area.destra - raggioBolla - m),
    limita(vero.y, area.alto + raggioBolla + m, area.basso - raggioBolla - m));
  const centroLL = mappa.containerPointToLatLng(centro);
  if (centro.distanceTo(vero) > 2) {     // spostata: linea tratteggiata verso la posizione vera
    L.polyline([dove, centroLL], { className: "filo-albero" + classeColore, weight: 2, interactive: false }).addTo(stratoAlbero);
  }

  // 2. Quante righe per colonna entrano in altezza, e quindi quante colonne servono
  const righeMax = Math.max(1, Math.floor((area.basso - area.alto - 2 * m) / ALTEZZA_RIGA));
  const colonne = Math.ceil(fiere.length / righeMax);
  const righe = Math.ceil(fiere.length / colonne);        // righe distribuite in modo uniforme
  const larghezza = colonne * LARGHEZZA_VOCE + (colonne - 1) * SPAZIO_COLONNE;
  const altezza = righe * ALTEZZA_RIGA;

  // 3. A destra della bolla se c'è spazio, altrimenti a sinistra (o dove ce n'è di più)
  const stacco = raggioBolla + 34;                       // distanza tra la bolla e l'elenco
  const spazioDestra = area.destra - m - (centro.x + stacco);
  const spazioSinistra = centro.x - stacco - (area.sinistra + m);
  const aSinistra = spazioDestra < larghezza && spazioSinistra > spazioDestra;
  const sinistraElenco = limita(aSinistra ? centro.x - stacco - larghezza : centro.x + stacco,
    area.sinistra + m, area.destra - m - larghezza);
  const altoElenco = limita(centro.y - altezza / 2, area.alto + m, area.basso - m - altezza);

  // 4. Le righe, colonna per colonna; per ogni colonna una "spina" verticale con dei
  //    rametti verso i pallini, collegata alla bolla
  for (let c = 0; c < colonne; c++) {
    const daQui = fiere.slice(c * righe, (c + 1) * righe);
    if (!daQui.length) continue;
    const xColonna = sinistraElenco + c * (LARGHEZZA_VOCE + SPAZIO_COLONNE);
    const xPallino = aSinistra ? xColonna + LARGHEZZA_VOCE - 13 : xColonna + 13;
    const xSpina = aSinistra ? xPallino + 24 : xPallino - 24;
    const yPrima = altoElenco + ALTEZZA_RIGA / 2;
    const yUltima = yPrima + (daQui.length - 1) * ALTEZZA_RIGA;
    const linea = (punti) => L.polyline(punti.map(([x, y]) => pixelInLL(x, y)),
      { className: "gamba-albero" + classeColore, weight: 2.5, interactive: false }).addTo(stratoAlbero);

    // dalla bolla alla spina, poi la spina verticale
    linea([[centro.x, centro.y], [xSpina, limita(centro.y, yPrima, yUltima)]]);
    linea([[xSpina, yPrima], [xSpina, yUltima]]);

    daQui.forEach((fiera, r) => {
      const y = yPrima + r * ALTEZZA_RIGA;
      linea([[xSpina, y], [xPallino + (aSinistra ? 13 : -13), y]]);     // rametto verso il pallino
      // Clic su una riga: la fiera viene mostrata sul suo PUNTO VERO della mappa, con il
      // cartellino (richiesta dell'utente); l'elenco si nasconde finché il cartellino è aperto
      ricordaFiera(L.marker(pixelInLL(xPallino, y), { icon: iconaVoce(fiera, aSinistra), title: fiera.nome, zIndexOffset: 1000, fiera }))
        .on("click", () => agganciaFiera(fiera, { daElenco: true }))
        .addTo(stratoAlbero);
    });
  }

  // La bolla al centro (cliccandola l'albero si chiude)
  L.marker(centroLL, { icon: iconaBolla(fiere.length, arancione, false, true), title: "Chiudi", zIndexOffset: 900 })
    .on("click", chiudiAlbero)
    .addTo(stratoAlbero);
}

// --- Solo la selezione resta visibile ---
// Quando si apre un albero, o il cartellino di un pallino, tutti gli altri pallini e
// bolle spariscono (classe "solo-selezione" sulla scheda della mappa, vedi style.css);
// restano visibili solo gli elementi con la classe "in-evidenza".
let iconaInEvidenza = null;      // il pallino singolo con il cartellino aperto

function aggiornaEvidenza() {
  schedaMappa.classList.toggle("solo-selezione", alberoAperto || !!iconaInEvidenza);
}

// Pallino dell'elenco cliccato: resta visibile SOLO quella riga (con il suo cartellino);
// le altre righe, la bolla e le linee dell'albero spariscono finché il cartellino è aperto
let vocescelta = null;

mappa.on("popupopen", (e) => {
  const icona = e.popup._source?._icon;
  if (icona?.classList.contains("voce-albero")) {
    vocescelta = icona;
    icona.classList.add("voce-scelta");
    schedaMappa.classList.add("solo-voce");
  } else if (icona && (e.popup._source === fieraAgganciata?.segnaposto || !icona.classList.contains("in-evidenza"))) {
    iconaInEvidenza = icona;
    icona.classList.add("in-evidenza");
    // fiera scelta dall'elenco: le righe dell'elenco spariscono, resta solo lei
    if (e.popup._source === fieraAgganciata?.segnaposto && fieraAgganciata.daElenco) schedaMappa.classList.add("solo-voce");
  }
  aggiornaEvidenza();
});
mappa.on("popupclose", (e) => {
  if (iconaInEvidenza) iconaInEvidenza.classList.remove("in-evidenza");
  iconaInEvidenza = null;
  // chiuso il cartellino della fiera "agganciata": la sganciamo (tutto torna normale)
  const chiuso = e.popup._source;
  if (chiuso && chiuso === fieraAgganciata?.segnaposto) {
    setTimeout(() => { if (fieraAgganciata?.segnaposto === chiuso) sganciaFiera(); }, 0);
  }
  if (vocescelta) vocescelta.classList.remove("voce-scelta");   // l'elenco ricompare intero
  vocescelta = null;
  schedaMappa.classList.remove("solo-voce");
  aggiornaEvidenza();
});

// Un clic sulla mappa chiude l'albero; ma se era aperto un cartellino, il primo clic
// chiude solo il cartellino (e l'albero resta aperto)
let cartellinoApertoAlClic = false;
mappa.on("preclick", () => { cartellinoApertoAlClic = !!(mappa._popup && mappa.hasLayer(mappa._popup)); });
mappa.on("click", () => {
  if (cartellinoApertoAlClic) { cartellinoApertoAlClic = false; return; }
  chiudiAlbero();
});
// Zoom: di solito l'albero si chiude. Ma se è aperto il cartellino di una fiera scelta
// dall'elenco, l'albero resta "in attesa" (nascosto) e dopo lo zoom viene ridisegnato
// per il nuovo ingrandimento: chiudendo il cartellino l'elenco ricompare.
mappa.on("zoomstart", () => {
  if (alberoAperto && fieraAgganciata?.daElenco) { stratoAlbero.clearLayers(); return; }
  chiudiAlbero();
});
mappa.on("zoomend", () => {
  if (alberoAperto && alberoCorrente && !stratoAlbero.getLayers().length) disegnaAlbero(alberoCorrente);
});

// --- Rotellina sopra una fiera: lo zoom continua e la fiera resta sotto il cursore ---
// (richiesta dell'utente) Se il puntatore è sopra una fiera (un pallino, una riga
// dell'elenco o il suo cartellino) e si gira la rotellina, la mappa si ingrandisce o
// rimpicciolisce attorno a QUELLA fiera: la fiera resta esattamente sotto il cursore,
// così si continua a zoomare per vedere le strade intorno senza "perderla".
// Per non farla sparire dentro una bolla (o con la chiusura dell'elenco), mettiamo un
// pallino "agganciato" tutto suo, che resta finché il mouse resta lì vicino o il
// cartellino è aperto. Anche se allo zoom minimo la mappa non può seguire (non esce
// dall'Italia), riavvicinando la fiera torna esattamente sotto il cursore.
const stratoAgganciata = L.layerGroup().addTo(mappa);
let fieraAgganciata = null;            // { fiera, segnaposto }

// Ogni pallino ricorda la sua fiera, per riconoscerla quando il mouse ci passa sopra
const fieraDiIcona = new WeakMap();
function ricordaFiera(segnaposto) {
  segnaposto.on("add", () => { if (segnaposto._icon) fieraDiIcona.set(segnaposto._icon, segnaposto.options.fiera); });
  return segnaposto;
}

// La fiera che sta sotto il puntatore (oppure null)
function fieraSottoIlPuntatore(elemento) {
  const icona = elemento.closest(".leaflet-marker-icon");
  if (icona) return fieraDiIcona.get(icona) || null;
  if (elemento.closest(".leaflet-popup")) return mappa._popup?._source?.options.fiera || null;
  return null;
}

function sganciaFiera() {
  if (!fieraAgganciata) return;
  const vecchia = fieraAgganciata;
  fieraAgganciata = null;
  ultimoPuntoRotella = null;
  if (mappa._popup?._source === vecchia.segnaposto) mappa.closePopup();
  stratoAgganciata.clearLayers();
}

// daElenco = true: la fiera è stata cliccata in una riga dell'elenco. Il suo pallino va sul
// punto vero della mappa con il cartellino aperto, e l'elenco resta (nascosto) per tornare
// visibile quando il cartellino si chiude.
function agganciaFiera(fiera, { daElenco = false } = {}) {
  if (fieraAgganciata?.fiera.id === fiera.id && !daElenco) return;       // è già lei
  const cartellinoAperto = daElenco || (mappa._popup && mappa.hasLayer(mappa._popup) &&
    mappa._popup._source?.options.fiera?.id === fiera.id);
  sganciaFiera();
  if (!daElenco) chiudiAlbero();
  if (mappa._popup && mappa.hasLayer(mappa._popup)) mappa.closePopup();
  const icona = pallino(fiera, true);
  if (daElenco) icona.options.className += " voce-scelta";   // resta visibile anche con l'elenco nascosto
  const segnaposto = ricordaFiera(L.marker([fiera.lat, fiera.lng],
    { icon: icona, title: fiera.nome, zIndexOffset: 2000, fiera }))
    .bindPopup(testoPopup(fiera), OPZIONI_CARTELLINO)
    .addTo(stratoAgganciata);
  fieraAgganciata = { fiera, segnaposto, daElenco };
  if (cartellinoAperto) segnaposto.openPopup();
}

// La fiera resta agganciata finché il mouse resta "lì": entro RAGGIO_AGGANCIO pixel dal
// punto dove si è girata la rotellina l'ultima volta, oppure dal pallino della fiera.
// Così basta un piccolo movimento involontario del mouse per NON perderla.
const RAGGIO_AGGANCIO = 40;
let ultimoPuntoRotella = null;         // dove stava il cursore all'ultimo scatto della rotellina

function vicinoAllaFieraAgganciata(punto) {
  if (!fieraAgganciata) return false;
  const puntoFiera = mappa.latLngToContainerPoint([fieraAgganciata.fiera.lat, fieraAgganciata.fiera.lng]);
  return punto.distanceTo(puntoFiera) <= RAGGIO_AGGANCIO ||
    (ultimoPuntoRotella && punto.distanceTo(ultimoPuntoRotella) <= RAGGIO_AGGANCIO);
}

// Il mouse si allontana davvero (e il cartellino è chiuso): la fiera si sgancia
mappa.getContainer().addEventListener("mousemove", (e) => {
  if (!fieraAgganciata) return;
  if (mappa._popup?._source === fieraAgganciata.segnaposto && mappa.hasLayer(mappa._popup)) return;
  if (!vicinoAllaFieraAgganciata(mappa.mouseEventToContainerPoint(e))) sganciaFiera();
});
mappa.getContainer().addEventListener("mouseleave", () => {
  if (fieraAgganciata && !(mappa._popup?._source === fieraAgganciata.segnaposto && mappa.hasLayer(mappa._popup))) sganciaFiera();
});

// La rotellina: stessa "velocità" dello zoom normale di Leaflet (wheelPxPerZoomLevel)
let rotellaAccumulata = 0, rotellaTimer = null, rotellaFiera = null, rotellaPunto = null;
mappa.getContainer().addEventListener("wheel", (e) => {
  const punto = mappa.mouseEventToContainerPoint(e);
  let fiera = fieraSottoIlPuntatore(e.target);
  // il cursore è scivolato di poco fuori dal pallino: è ancora la fiera agganciata
  if (!fiera && vicinoAllaFieraAgganciata(punto)) fiera = fieraAgganciata.fiera;
  if (!fiera || fiera.lat == null) return;       // non sopra una fiera: zoom normale
  e.preventDefault();                            // niente scorrimento della pagina
  e.stopPropagation();                           // e niente zoom "normale" di Leaflet
  rotellaFiera = fiera;
  rotellaPunto = punto;
  ultimoPuntoRotella = punto;
  rotellaAccumulata += L.DomEvent.getWheelDelta(e);
  if (!rotellaTimer) rotellaTimer = setTimeout(zoomSullaFiera, 40);
}, { capture: true, passive: false });

function zoomSullaFiera() {
  rotellaTimer = null;
  // Se lo zoom precedente si sta ancora animando, aspettiamo: gli scatti si sommano,
  // non vanno persi
  if (mappa._animatingZoom) { rotellaTimer = setTimeout(zoomSullaFiera, 30); return; }
  const delta = rotellaAccumulata;
  rotellaAccumulata = 0;
  const zoom = mappa.getZoom();
  // (stessa formula che usa Leaflet per la rotellina)
  const d2 = delta / (mappa.options.wheelPxPerZoomLevel * 4);
  const d3 = (4 * Math.log(2 / (1 + Math.exp(-Math.abs(d2))))) / Math.LN2;
  const passo = mappa.options.zoomSnap ? Math.ceil(d3 / mappa.options.zoomSnap) * mappa.options.zoomSnap : d3;
  const nuovoZoom = mappa._limitZoom(zoom + (delta > 0 ? passo : -passo));
  if (nuovoZoom === zoom) return;

  agganciaFiera(rotellaFiera);
  // Il nuovo centro della mappa è calcolato in modo che la fiera finisca sotto il cursore
  const puntoFiera = mappa.project([rotellaFiera.lat, rotellaFiera.lng], nuovoZoom);
  const centro = mappa.unproject(puntoFiera.subtract(rotellaPunto).add(mappa.getSize().divideBy(2)), nuovoZoom);
  mappa.setView(centro, nuovoZoom);
}

// --- Bolle numerate e pallini delle fiere ---
// Ci sono due "modi" di mostrare le fiere:
//  1. ITALIA INTERA (da lontano, nessuna regione scelta): per ogni regione una bolla
//     BLU (fiere che devono ancora iniziare) e una ARANCIONE (fiere in corso).
//     Blu + arancione = totale della regione (lo stesso numero del suggerimento).
//  2. DA VICINO (o con una regione scelta): i pallini delle fiere, raggruppati in
//     bolle solo quando sono molto vicini; fiere in corso e fiere future stanno in
//     DUE gruppi separati, quindi non finiscono mai nella stessa bolla.
// In entrambi i modi le bolle vengono distanziate: non si accavallano mai.

const centriRegioni = new Map();            // nome della regione -> punto centrale
const stratoBolleRegioni = L.layerGroup();  // le bolle "per regione" (modo 1)
const SPAZIO_TRA_BOLLE = 6;                 // pixel minimi tra una bolla e l'altra

// Dimensione delle bolle, in proporzione alla cartina:
//  - più fiere = bolla più grande
//  - nella vista dell'Italia intera le bolle sono più piccole (l'Italia è piccola sullo
//    schermo), da vicino sono più grandi
function diametroBolla(n, vistaItalia = vistaPerRegioni()) {
  const misure = vistaItalia ? [30, 35, 40, 46] : [38, 44, 50, 56];
  return misure[n < 10 ? 0 : n < 30 ? 1 : n < 60 ? 2 : 3];
}
// La bolla con il numero: arancione per le fiere in corso, blu per le altre.
// inEvidenza = true per la bolla al centro di un albero aperto (resta visibile).
function iconaBolla(n, arancione = false, vistaItalia = vistaPerRegioni(), inEvidenza = false) {
  const d = diametroBolla(n, vistaItalia);
  return L.divIcon({
    html: `<span>${n}</span>`,
    className: (arancione ? "gruppo in-corso" : "gruppo") + (vistaItalia ? " gruppo-piccolo" : "") +
      (inEvidenza ? " in-evidenza" : ""),
    iconSize: [d, d],
  });
}

// Spinge via le bolle che si toccano, finché sono tutte separate.
// Ogni bolla è { x, y, raggio } in pixel; x e y vengono modificati.
function distanzia(bolle) {
  for (let giro = 0; giro < 200; giro++) {
    let spostate = false;
    for (let i = 0; i < bolle.length; i++) {
      for (let j = i + 1; j < bolle.length; j++) {
        const a = bolle[i], b = bolle[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let distanza = Math.hypot(dx, dy);
        const minima = a.raggio + b.raggio + SPAZIO_TRA_BOLLE;
        if (distanza >= minima) continue;
        if (distanza < 0.01) { dx = 1; dy = 0; distanza = 1; }   // stesso punto: le apriamo in orizzontale
        const spinta = (minima - distanza) / 2 + 0.5;
        a.x -= (dx / distanza) * spinta; a.y -= (dy / distanza) * spinta;
        b.x += (dx / distanza) * spinta; b.y += (dy / distanza) * spinta;
        spostate = true;
      }
    }
    if (!spostate) return;
  }
}

// I due gruppi di pallini (modo 2): fiere future (blu) e fiere in corso (arancione)
function creaGruppo(arancione) {
  const gruppo = L.markerClusterGroup({
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,         // il clic sulla bolla lo gestiamo noi (qui sotto)
    spiderfyOnMaxZoom: false,           // l'albero è il nostro (apriAlbero), non quello della libreria
    maxClusterRadius: 80,
    iconCreateFunction: (bolla) => iconaBolla(bolla.getChildCount(), arancione, false),
  });
  // Clic su una bolla: si apre SEMPRE "l'albero" con le sue fiere
  gruppo.on("clusterclick", (e) =>
    apriAlbero(e.layer.getLatLng(), e.layer.getAllChildMarkers().map((m) => m.options.fiera), arancione));

  // Dopo ogni raggruppamento controlliamo che nessuna bolla ne copra un'altra
  gruppo.on("animationend", () => setTimeout(separaSovrapposti, 0));
  return gruppo;
}
const gruppoFiere = creaGruppo(false);
const gruppoInCorso = creaGruppo(true);

// Siamo nel modo 1 (una bolla per regione)?
function vistaPerRegioni() {
  return mappa.getZoom() < SOGLIA_DETTAGLIO && !campi.regione.value;
}

// Modo 1: disegna per ogni regione la bolla blu e quella arancione, distanziate
function disegnaBolleRegioni() {
  stratoBolleRegioni.clearLayers();

  // 1. Ogni bolla parte dal centro della sua regione (in pixel sullo schermo);
  //    la blu un po' a sinistra e l'arancione un po' a destra, così si affiancano
  const bolle = [];
  for (const [nome, totale] of Object.entries(fierePerRegione)) {
    const centro = centriRegioni.get(nome);
    if (!totale || !centro) continue;
    const p = mappa.latLngToContainerPoint(centro);
    const nInCorso = inCorsoPerRegione[nome] || 0;
    const nFuture = totale - nInCorso;
    if (nFuture) bolle.push({ nome, n: nFuture, arancione: false, centro, x: p.x - (nInCorso ? 12 : 0), y: p.y, raggio: diametroBolla(nFuture) / 2 });
    if (nInCorso) bolle.push({ nome, n: nInCorso, arancione: true, centro, x: p.x + (nFuture ? 12 : 0), y: p.y, raggio: diametroBolla(nInCorso) / 2 });
  }

  // 2. Le allontaniamo finché non si toccano più
  distanzia(bolle);

  // 3. Disegniamo le bolle (con una linea sottile verso la regione, se si sono spostate molto)
  const periodo = campi.periodo.selectedOptions[0]?.dataset.descrizione ?? "";
  for (const b of bolle) {
    const posizione = mappa.containerPointToLatLng([b.x, b.y]);
    const origine = mappa.latLngToContainerPoint(b.centro);
    if (Math.hypot(b.x - origine.x, b.y - origine.y) > b.raggio + 14) {
      L.polyline([b.centro, posizione], { className: b.arancione ? "filo filo-in-corso" : "filo", interactive: false, weight: 2 })
        .addTo(stratoBolleRegioni);
      L.circleMarker(b.centro, { className: "filo-punto", radius: 3, interactive: false }).addTo(stratoBolleRegioni);
    }
    const titolo = b.arancione
      ? `${b.nome}: ${b.n} ${b.n === 1 ? "fiera" : "fiere"} in corso`
      : `${b.nome}: ${b.n} ${b.n === 1 ? "fiera" : "fiere"} ${periodo} (non ancora iniziate)`;
    const bolla = L.marker(posizione, { icon: iconaBolla(b.n, b.arancione), title: titolo });
    // Clic sulla bolla: si apre l'albero con le fiere della regione (senza entrarci)
    bolla.on("click", () => apriAlbero(posizione, tutteLeFiere.filter((f) =>
      f.regione === b.nome && f.lat != null && passaIFiltri(f, true) && inCorso(f) === b.arancione), b.arancione));
    bolla.addTo(stratoBolleRegioni);
  }
}

// Modo 2: le bolle e i pallini dei due gruppi potrebbero cadere uno sull'altro
// (es. nello stesso quartiere fieristico ci sono fiere in corso e fiere future).
// Li "spostiamo di lato" quanto basta, solo nel disegno (CSS "translate"),
// senza cambiare la loro posizione vera sulla mappa.
function separaSovrapposti() {
  if (vistaPerRegioni()) return;
  if (alberoAperto) return;      // albero aperto: gli altri pallini sono nascosti, non tocchiamo nulla

  const elementi = [];
  for (const gruppo of [gruppoFiere, gruppoInCorso]) {
    if (!mappa.hasLayer(gruppo)) continue;
    gruppo._featureGroup.eachLayer((l) => {
      if (!l._icon) return;
      l._icon.style.translate = "";
      const p = mappa.latLngToLayerPoint(l.getLatLng());
      elementi.push({ icona: l._icon, x: p.x, y: p.y, x0: p.x, y0: p.y, raggio: (l._icon.offsetWidth || 30) / 2 });
    });
  }
  distanzia(elementi);
  for (const e of elementi) {
    const dx = e.x - e.x0, dy = e.y - e.y0;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) e.icona.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
  }
}

// Passa dal modo 1 al modo 2 (e viceversa) a seconda dello zoom e dei filtri
function aggiornaSegnaposto() {
  if (vistaPerRegioni()) {
    gruppoFiere.remove();
    gruppoInCorso.remove();
    disegnaBolleRegioni();
    stratoBolleRegioni.addTo(mappa);
  } else {
    stratoBolleRegioni.remove();
    gruppoFiere.addTo(mappa);
    gruppoInCorso.addTo(mappa);
    setTimeout(separaSovrapposti, 0);
  }
}
mappa.on("zoomend", aggiornaSegnaposto);

// --- Colori della mappa stradale in base allo zoom ---
// Da lontano la mappa è grigia e spenta (fa risaltare le bolle); avvicinandosi
// recupera colori e contrasto, così strade e nomi si leggono bene (vedi style.css)
function aggiornaColoriCartina() {
  const z = mappa.getZoom();
  schedaMappa.classList.toggle("cartina-lontana", z < 8);
  schedaMappa.classList.toggle("cartina-media", z >= 8 && z < 11);
  schedaMappa.classList.toggle("cartina-vicina", z >= 11);
}
mappa.on("zoomend", aggiornaColoriCartina);
aggiornaColoriCartina();
mappa.on("resize", () => { if (vistaPerRegioni()) disegnaBolleRegioni(); });

// Qui ricordiamo il pallino di ogni fiera, per poterlo aprire cliccando nell'elenco
const segnapostoPerId = new Map();

// Opzioni dei cartellini. La cartina è fissa, quindi NON si sposta per mostrare un
// cartellino (autoPan: false): se un cartellino uscirebbe dalla mappa, lo spostiamo
// noi (vedi "sistemaCartellino" qui sotto).
const OPZIONI_CARTELLINO = { maxWidth: 300, autoPan: false };

// Quando si apre un cartellino controlliamo che stia tutto dentro la mappa:
//  - se uscirebbe in alto, lo apriamo SOTTO il pallino invece che sopra
//  - se uscirebbe a sinistra o a destra, lo spostiamo di lato quanto basta
function sistemaCartellino(e) {
  const cartellino = e.popup;
  const el = cartellino.getElement();
  if (!el || cartellino._sistemato) return;
  const mappaBox = mappa.getContainer().getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const margine = 12;
  // il bordo alto "utile" è quello visibile (sotto la fascia dei filtri, se la copre)
  const altoVisibile = mappaBox.top + areaVisibileMappa().alto;

  let dx = 0, dy = 0;
  if (box.left < mappaBox.left + margine) dx = mappaBox.left + margine - box.left;
  else if (box.right > mappaBox.right - margine) dx = mappaBox.right - margine - box.right;
  if (box.top < altoVisibile + margine) {
    dy = box.height + 34;                 // sotto il pallino: altezza del cartellino + pallino
    el.classList.add("cartellino-sotto");
  }
  if (dx) el.classList.add("cartellino-spostato");   // spostato di lato: la punta non serve
  if (dx || dy) {
    cartellino._sistemato = true;
    cartellino.options.offset = L.point(cartellino.options.offset).add([dx, dy]);
    cartellino.update();
  }
}
mappa.on("popupopen", sistemaCartellino);

// Alla chiusura il cartellino torna alle impostazioni normali (per la prossima apertura)
mappa.on("popupclose", (e) => {
  if (!e.popup._sistemato) return;
  e.popup._sistemato = false;
  e.popup.options.offset = L.point(0, 7);              // posizione normale (sopra il pallino)
  e.popup.getElement()?.classList.remove("cartellino-sotto", "cartellino-spostato");
});

// Sposta la mappa con un movimento morbido ("volo"): lento e dolce, e la regione
// riempie quasi tutta la scheda (margine piccolo).
// Con anima = false si posiziona subito (serve all'apertura della pagina)
function voloSu(limiti, zoomMassimo = 10, anima = true) {
  const opzioni = { padding: [20, 20], maxZoom: zoomMassimo };
  if (anima && !menoMovimento) mappa.flyToBounds(limiti, { ...opzioni, duration: 1.6, easeLinearity: 0.15 });
  else mappa.fitBounds(limiti, { ...opzioni, animate: false });
}


// =========================================================
// Funzioni di aiuto
// =========================================================

// Evita che testi strani nei dati vengano interpretati come codice HTML
function sicuro(testo) {
  return String(testo ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Trasforma "2026-11-03" e "2026-11-08" in "3 – 8 nov 2026"
function formattaDate(inizio, fine) {
  const opzioni = { day: "numeric", month: "short", year: "numeric" };
  const a = new Date(inizio + "T12:00:00");
  const b = new Date(fine + "T12:00:00");
  if (inizio === fine) return a.toLocaleDateString("it-IT", opzioni);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} – ${b.toLocaleDateString("it-IT", opzioni)}`;
  }
  return `${a.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${b.toLocaleDateString("it-IT", opzioni)}`;
}

// Una fiera è "in corso" se oggi è compreso tra la data di inizio e quella di fine
function inCorso(fiera) {
  return fiera.inizio <= oggi && fiera.fine >= oggi;
}

// Riempie un menu a tendina con una lista di valori (mantenendo la prima opzione "Tutte…")
function riempiMenu(menu, valori) {
  const primaOpzione = menu.options[0];
  menu.replaceChildren(primaOpzione);
  for (const valore of valori) menu.add(new Option(valore, valore));
}

// Valori unici e in ordine alfabetico di un certo campo (es. tutti i settori)
function valoriUnici(fiere, campo) {
  return [...new Set(fiere.map((f) => f[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
}

function luogo(fiera) {
  const parti = [fiera.citta, fiera.provincia ? `(${fiera.provincia})` : ""].filter(Boolean).join(" ");
  return parti || "Luogo non indicato";
}


// =========================================================
// Filtri
// =========================================================

// Controlla se una fiera rispetta il periodo scelto (regola decisa dall'utente):
//  - "oggi" (In corso): tutte le fiere già iniziate (e non finite)
//  - "settimana" (Prossimi 7 giorni): le fiere che iniziano entro 7 giorni, più
//     le fiere in corso SOLO se finiscono entro 7 giorni
//  - "" (Prossimi 30 giorni): le fiere che iniziano entro 30 giorni, più
//     le fiere in corso SOLO se finiscono entro 30 giorni
// (sulla mappa le fiere in corso restano comunque separate, in arancione)
function nelPeriodo(fiera, periodo) {
  if (periodo === "oggi") return inCorso(fiera);
  const giorni = periodo === "settimana" ? 7 : GIORNI_MASSIMI;
  const limite = oggiPiuGiorni(giorni);
  if (inCorso(fiera)) return fiera.fine <= limite;
  return fiera.inizio <= limite;
}

// Controlla se una fiera rispetta tutti i filtri scelti.
// Con ignoraRegione = true non guarda il filtro della regione: serve per contare
// le fiere di OGNI regione con gli stessi criteri dell'elenco (vedi contaPerRegione)
function passaIFiltri(fiera, ignoraRegione = false) {
  const testo = campi.testo.value.trim().toLowerCase();
  if (testo && !`${fiera.nome} ${fiera.citta ?? ""} ${fiera.settore ?? ""}`.toLowerCase().includes(testo)) return false;
  if (!ignoraRegione && campi.regione.value && fiera.regione !== campi.regione.value) return false;
  if (campi.settore.value && fiera.settore !== campi.settore.value) return false;
  if (campi.tipologia.value && fiera.tipologia !== campi.tipologia.value) return false;
  return nelPeriodo(fiera, campi.periodo.value);
}

// Ricalcola quante fiere ha ogni regione, con i filtri scelti (periodo, settore,
// tipologia, ricerca). Si chiama ogni volta che cambia un filtro.
function contaPerRegione() {
  fierePerRegione = {};
  inCorsoPerRegione = {};
  for (const f of tutteLeFiere) {
    if (!f.regione || !passaIFiltri(f, true)) continue;
    fierePerRegione[f.regione] = (fierePerRegione[f.regione] || 0) + 1;
    if (inCorso(f)) inCorsoPerRegione[f.regione] = (inCorsoPerRegione[f.regione] || 0) + 1;
  }
}

// Salva i filtri nell'indirizzo della pagina (es. mappa.html#regione=Veneto),
// così si può condividere il link a una regione specifica
function salvaFiltriNellIndirizzo() {
  const parametri = new URLSearchParams();
  for (const [nome, campo] of Object.entries(campi)) {
    if (campo.value) parametri.set(nome, campo.value);
  }
  history.replaceState(null, "", parametri.toString() ? `#${parametri}` : location.pathname);
}

function leggiFiltriDallIndirizzo() {
  const parametri = new URLSearchParams(location.hash.slice(1));
  for (const [nome, campo] of Object.entries(campi)) {
    if (parametri.has(nome)) campo.value = parametri.get(nome);
  }
}


// =========================================================
// Disegno di pallini ed elenco
// =========================================================

// Accetta solo indirizzi web veri ("https://..."); "www.sito.it" diventa "https://www.sito.it"
function linkSicuro(indirizzo) {
  if (!indirizzo) return "";
  const pulito = String(indirizzo).trim();
  if (/^www\./i.test(pulito)) return "https://" + pulito;
  return /^https?:\/\//i.test(pulito) ? pulito : "";
}

// Il nome del sito senza "https://www." (es. "ecomondo.com")
function nomeSito(indirizzo) {
  try { return new URL(indirizzo).hostname.replace(/^www\./, ""); } catch { return indirizzo; }
}

// Il link "Sito organizzatore" deve esserci SEMPRE:
//  1. il sito dell'organizzatore, se lo conosciamo
//  2. altrimenti il sito ufficiale della fiera
//  3. altrimenti una ricerca sul web con il nome dell'organizzatore (o della fiera)
function linkOrganizzatore(fiera) {
  const sito = linkSicuro(fiera.organizzatore?.sito || fiera.sito) || linkSicuro(fiera.sito_fiera);
  if (sito) return { indirizzo: sito, ricerca: false };
  const chi = fiera.organizzatore?.nome || fiera.nome;
  return {
    indirizzo: "https://www.google.com/search?q=" + encodeURIComponent(`${chi} ${fiera.nome} sito ufficiale`),
    ricerca: true,
  };
}

function testoPopup(fiera) {
  const org = linkOrganizzatore(fiera);
  const link = [
    `<a href="${sicuro(org.indirizzo)}" target="_blank" rel="noopener"
        ${org.ricerca ? 'title="Il calendario ufficiale non indica il sito: si apre una ricerca sul web"' : ""}>Sito organizzatore</a>`,
    `<a href="${sicuro(fiera.fonte)}" target="_blank" rel="noopener">Scheda AEFI</a>`,
    `<button type="button" class="link-info" data-id="${sicuro(fiera.id)}">Info fiera</button>`,
  ].join("");
  return `
    <div class="popup">
      <h3>${sicuro(fiera.nome)}</h3>
      <p>${inCorso(fiera) ? '<span class="etichetta in-corso">In corso</span>' : ""}<strong>${formattaDate(fiera.inizio, fiera.fine)}</strong></p>
      <p>${sicuro(luogo(fiera))}${fiera.quartiere ? ` · ${sicuro(fiera.quartiere)}` : ""}</p>
      ${fiera.settore ? `<p>${sicuro(fiera.settore)}</p>` : ""}
      ${fiera.tipologia ? `<p><span class="etichetta">${sicuro(fiera.tipologia)}</span></p>` : ""}
      <p class="link">${link}</p>
    </div>`;
}

// =========================================================
// Finestrella "Info fiera"
// =========================================================

const finestraInfo = document.getElementById("info-fiera");
const contenutoInfo = document.getElementById("info-contenuto");

// Giorni tra due date "AAAA-MM-GG" (es. tra oggi e l'inizio della fiera)
function giorniTra(da, a) {
  return Math.round((new Date(a + "T12:00:00") - new Date(da + "T12:00:00")) / 86400000);
}

// "Inizia tra 27 giorni", "Inizia domani", "In corso fino al 13 ott", …
function quandoInizia(fiera) {
  if (inCorso(fiera)) {
    if (fiera.fine === oggi) return "In corso: oggi è l'ultimo giorno";
    const fine = new Date(fiera.fine + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
    return `In corso fino al ${fine}`;
  }
  const giorni = giorniTra(oggi, fiera.inizio);
  return giorni === 1 ? "Inizia domani" : `Inizia tra ${giorni} giorni`;
}

// Una riga della sezione "Da sapere" (non la scriviamo se il valore manca)
function riga(etichetta, valore) {
  return valore ? `<li><span>${etichetta}</span><strong>${valore}</strong></li>` : "";
}

function apriInfoFiera(id) {
  const fiera = tutteLeFiere.find((f) => f.id === id);
  if (!fiera) return;

  const org = fiera.organizzatore || {};
  const sitoFiera = linkSicuro(fiera.sito_fiera);
  const linkOrg = linkOrganizzatore(fiera);
  const sitoOrg = linkOrg.ricerca ? "" : linkOrg.indirizzo;
  const durata = giorniTra(fiera.inizio, fiera.fine) + 1;

  // --- Chi la organizza ---
  const contatti = [
    org.telefono ? `Tel. ${sicuro(org.telefono)}` : "",
    org.email ? `<a href="mailto:${sicuro(org.email)}">${sicuro(org.email)}</a>` : "",
    sitoOrg
      ? `<a href="${sicuro(sitoOrg)}" target="_blank" rel="noopener">${sicuro(nomeSito(sitoOrg))}</a>`
      : `<a href="${sicuro(linkOrg.indirizzo)}" target="_blank" rel="noopener">cerca il sito sul web</a>`,
  ].filter(Boolean).join(" · ");
  const chi = org.nome
    ? `<p class="info-nome">${sicuro(org.nome)}</p>
       ${org.indirizzo ? `<p>${sicuro(org.indirizzo.replace(/^[\s,–-]+/, ""))}</p>` : ""}
       ${contatti ? `<p>${contatti}</p>` : ""}`
    : "<p>L'organizzatore non è indicato nel calendario ufficiale.</p>";

  // --- In breve: riassunto scritto da noi con parole nostre (con la fonte).
  // Non mostriamo i testi di AEFI o dei siti delle fiere: sono protetti da diritto d'autore.
  let cosa = "";
  const fonteRiassunto = linkSicuro(fiera.fonte_riassunto);
  if (fiera.riassunto) {
    cosa += `<section><h3><span aria-hidden="true">📝</span> In breve</h3><p>${sicuro(fiera.riassunto)}</p>
      ${fonteRiassunto ? `<p class="info-fonte">Fonte:
        <a href="${sicuro(fonteRiassunto)}" target="_blank" rel="noopener">${sicuro(nomeSito(fonteRiassunto))}</a></p>` : ""}</section>`;
  }
  if (!cosa) {
    cosa = `<section><h3><span aria-hidden="true">🎯</span> Di cosa si tratta</h3>
      <p>Non abbiamo ancora una descrizione di questa fiera.
      Trovi tutti i dettagli ${sitoOrg ? `sul <a href="${sicuro(sitoOrg)}" target="_blank" rel="noopener">sito dell'organizzatore</a> o ` : ""}nella
      <a href="${sicuro(fiera.fonte)}" target="_blank" rel="noopener">scheda AEFI</a>.</p></section>`;
  }

  contenutoInfo.innerHTML = `
    <header class="info-testata">
      <p class="info-etichette">
        ${inCorso(fiera) ? '<span class="etichetta in-corso">In corso</span>' : ""}
        ${fiera.tipologia ? `<span class="etichetta">${sicuro(fiera.tipologia)}</span>` : ""}
      </p>
      <h2 id="info-titolo">${sicuro(fiera.nome)}</h2>
      <p>${formattaDate(fiera.inizio, fiera.fine)} · ${sicuro(luogo(fiera))}</p>
    </header>

    <div class="info-corpo">
      <section><h3><span aria-hidden="true">🏢</span> Chi la organizza</h3>${chi}</section>
      ${cosa}
      <section>
        <h3><span aria-hidden="true">📅</span> Da sapere</h3>
        <ul class="info-dati">
          ${riga("Quando", formattaDate(fiera.inizio, fiera.fine))}
          ${riga("Durata", durata === 1 ? "1 giorno" : `${durata} giorni`)}
          ${riga("Stato", quandoInizia(fiera))}
          ${riga("Dove", sicuro(luogo(fiera)))}
          ${riga("Quartiere fieristico", sicuro(fiera.quartiere))}
          ${riga("Regione", sicuro(fiera.regione))}
          ${riga("Settore", sicuro(fiera.settore))}
          ${riga("Tipologia", sicuro(fiera.tipologia))}
        </ul>
      </section>
    </div>

    <footer class="info-piede">
      ${sitoFiera ? `<a class="bottone-principale" href="${sicuro(sitoFiera)}" target="_blank" rel="noopener">Sito ufficiale della fiera →</a>` : ""}
      <a class="bottone-contorno" href="${sicuro(fiera.fonte)}" target="_blank" rel="noopener">Scheda AEFI</a>
      <p>Fonti: calendario AEFI${fiera.riassunto ? "; riassunto scritto da noi a partire da fonti pubbliche" : ""}.
         Verifica sempre date e dettagli prima di partire.</p>
    </footer>`;

  finestraInfo.showModal();
  finestraInfo.scrollTop = 0;
}

// Il link "Info fiera" sta dentro i cartellini della mappa, che vengono creati e
// distrutti di continuo: ascoltiamo i clic su tutta la pagina e controlliamo se
// è stato cliccato proprio un "Info fiera"
document.addEventListener("click", (e) => {
  const bottone = e.target.closest(".link-info");
  if (bottone) apriInfoFiera(bottone.dataset.id);
});

// Chiusura: con la ×, con il tasto Esc (automatico) o cliccando fuori dalla finestrella
document.getElementById("info-chiudi").addEventListener("click", () => finestraInfo.close());
finestraInfo.addEventListener("click", (e) => {
  if (e.target === finestraInfo) finestraInfo.close();
});


// Il pallino di una fiera: arancio e "pulsante" se è in corso, blu altrimenti
// inEvidenza = true per i pallini di un albero aperto (restano visibili)
function pallino(fiera, inEvidenza = false) {
  return L.divIcon({
    className: (inCorso(fiera) ? "punto in-corso" : "punto") + (inEvidenza ? " in-evidenza" : ""),
    iconSize: [26, 26],
  });
}

// La scheda di una fiera nell'elenco, con la data d'inizio in un cerchio
function schedaFiera(fiera, posizione) {
  const inizio = new Date(fiera.inizio + "T12:00:00");
  const mese = inizio.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
  return `
    <li class="scheda-fiera rivela${inCorso(fiera) ? " in-corso" : ""}" tabindex="0"
        data-id="${sicuro(fiera.id)}" style="--ritardo: ${(posizione % 3) * 80}ms">
      <div class="data-tonda" aria-hidden="true"><strong>${inizio.getDate()}</strong><span>${mese}</span></div>
      <div class="scheda-testo">
        <h3>${sicuro(fiera.nome)}</h3>
        <p>${formattaDate(fiera.inizio, fiera.fine)} · ${sicuro(luogo(fiera))}</p>
        ${fiera.settore ? `<p class="settore">${sicuro(fiera.settore)}</p>` : ""}
        <p class="etichette">
          ${inCorso(fiera) ? '<span class="etichetta in-corso">In corso</span>' : ""}
          ${fiera.tipologia ? `<span class="etichetta">${sicuro(fiera.tipologia)}</span>` : ""}
          ${fiera.lat == null ? '<span class="etichetta tenue">Non sulla mappa</span>' : ""}
        </p>
      </div>
    </li>`;
}

function aggiorna({ spostaMappa = true, anima = true } = {}) {
  chiudiAlbero();             // se c'era un albero aperto, lo chiudiamo
  sganciaFiera();             // e anche l'eventuale fiera "agganciata" dalla rotellina
  const visibili = tutteLeFiere.filter((f) => passaIFiltri(f));
  contaPerRegione();

  // --- Pallini sulla mappa: le fiere in corso nel gruppo arancione, le altre in quello blu ---
  gruppoFiere.clearLayers();
  gruppoInCorso.clearLayers();
  segnapostoPerId.clear();
  const future = [], aperte = [];
  for (const fiera of visibili) {
    if (fiera.lat == null || fiera.lng == null) continue;
    // (la fiera è salvata nel pallino: serve all'albero quando si clicca una bolla)
    const m = ricordaFiera(L.marker([fiera.lat, fiera.lng], { icon: pallino(fiera), title: fiera.nome, fiera }))
      .bindPopup(testoPopup(fiera), OPZIONI_CARTELLINO);
    segnapostoPerId.set(fiera.id, m);
    (inCorso(fiera) ? aperte : future).push(m);
  }
  gruppoFiere.addLayers(future);
  gruppoInCorso.addLayers(aperte);
  aggiornaSegnaposto();
  aggiornaRegioni();

  // --- Movimento della mappa: regione scelta oppure Italia intera ---
  if (spostaMappa) {
    const forma = campi.regione.value && stratoRegioni?.getLayers()
      .find((l) => l.feature.properties.nome === campi.regione.value);
    if (forma) voloSu(forma.getBounds(), 10, anima);
    else voloSu(ITALIA, mappa.getMinZoom(), anima);
  }

  // --- Conteggio: es. "118 fiere nei prossimi 30 giorni" oppure "17 fiere in corso" ---
  const descrizionePeriodo = campi.periodo.selectedOptions[0]?.dataset.descrizione ?? "";
  conteggio.textContent = `${visibili.length} ${visibili.length === 1 ? "fiera" : "fiere"} ${descrizionePeriodo}`;

  // --- Bolle della testata: la bolla del periodo scelto è evidenziata ---
  document.querySelectorAll(".bolla").forEach((b) =>
    b.classList.toggle("attiva", b.dataset.periodo === campi.periodo.value));

  // --- Schede dell'elenco ---
  // Se le schede diminuiscono, la pagina si accorcia: chi era in fondo alla pagina si
  // ritroverebbe "oltre la fine" e il browser lo farebbe saltare in alto a caso.
  // Ci annotiamo dov'eravamo, e se serve ci fermiamo con ordine all'inizio dell'elenco.
  const posizionePrima = scrollY;
  elenco.innerHTML = visibili.length
    ? visibili.map(schedaFiera).join("")
    : '<li class="vuoto">Nessuna fiera corrisponde ai filtri scelti.</li>';
  osservaRivela(elenco);
  sistemaScorrimento(posizionePrima);
}

// Dopo un cambio dei filtri: se la pagina è diventata troppo corta per restare dove
// eravamo, ci fermiamo all'inizio della sezione "Le fiere" (sotto la barra in alto e
// la fascia dei filtri); altrimenti la pagina resta esattamente dov'era.
function sistemaScorrimento(posizionePrima) {
  const massimo = document.documentElement.scrollHeight - innerHeight;
  if (posizionePrima <= massimo) {
    if (scrollY !== posizionePrima) scrollTo({ top: posizionePrima, behavior: "instant" });
    return;
  }
  const sezione = document.getElementById("fiere");
  const fascia = document.querySelector(".fascia-filtri");
  const barra = document.getElementById("barra-alta");
  const sopra = (barra?.offsetHeight || 60) +
    (fascia && getComputedStyle(fascia).position === "sticky" ? fascia.offsetHeight : 0) + 12;
  const inizioElenco = sezione.getBoundingClientRect().top + scrollY - sopra;
  scrollTo({ top: Math.min(inizioElenco, massimo), behavior: "instant" });
}

// Clic su una fiera dell'elenco: si torna su alla mappa e si apre la sua finestrella
function mostraSullaMappa(id) {
  const m = segnapostoPerId.get(id);
  if (!m) return;
  // Scorriamo in modo che la mappa inizi subito sotto la barra in alto e la fascia
  // dei filtri (che resta attaccata in alto, tranne sul telefono)
  const fascia = document.querySelector(".fascia-filtri");
  const barra = document.getElementById("barra-alta");
  const sottoIFiltri = (barra?.offsetHeight || 60) + 16 +
    (getComputedStyle(fascia).position === "sticky" ? fascia.offsetHeight : 0);
  scrollTo({
    top: schedaMappa.getBoundingClientRect().top + scrollY - sottoIFiltri,
    behavior: menoMovimento ? "auto" : "smooth",
  });
  // Ci avviciniamo alla fiera (così si vedono i pallini) e apriamo il suo cartellino.
  // Se la fiera è dentro una bolla (es. stesso quartiere fieristico di altre fiere),
  // apriamo l'albero di quella bolla e poi il cartellino della fiera.
  setTimeout(() => {
    const arancione = gruppoInCorso.hasLayer(m);
    const gruppo = arancione ? gruppoInCorso : gruppoFiere;
    const apri = () => {
      const bolla = gruppo.getVisibleParent(m);
      if (!bolla || bolla === m) { m.openPopup(); return; }
      const fiere = bolla.getAllChildMarkers().map((x) => x.options.fiera);
      apriAlbero(bolla.getLatLng(), fiere, arancione);
      stratoAlbero.eachLayer((l) => { if (l.options?.title === m.options.fiera.nome && l.getPopup) l.openPopup(); });
    };
    const zoom = Math.max(mappa.getZoom(), SOGLIA_DETTAGLIO + 2);
    if (mappa.getZoom() === zoom && mappa.getBounds().pad(-0.2).contains(m.getLatLng())) {
      apri();                                     // la fiera è già ben visibile: niente spostamento
    } else {
      mappa.once("moveend", () => setTimeout(apri, 80));
      mappa.setView(m.getLatLng(), zoom, { animate: !menoMovimento });
    }
  }, menoMovimento ? 0 : 700);
}

// Conta le fiere di ogni periodo (per le bolle della testata)
function contaPerPeriodo() {
  document.getElementById("numero-oggi").textContent = tutteLeFiere.filter((f) => nelPeriodo(f, "oggi")).length;
  document.getElementById("numero-settimana").textContent = tutteLeFiere.filter((f) => nelPeriodo(f, "settimana")).length;
  document.getElementById("numero-mese").textContent = tutteLeFiere.filter((f) => nelPeriodo(f, "")).length;
}


// =========================================================
// Eventi: cosa succede quando l'utente interagisce
// =========================================================

for (const campo of Object.values(campi)) {
  campo.addEventListener(campo.tagName === "INPUT" ? "input" : "change", () => {
    salvaFiltriNellIndirizzo();
    // Solo la regione sposta la mappa; gli altri filtri lasciano la vista com'è
    aggiorna({ spostaMappa: campo === campi.regione });
  });
}

document.getElementById("azzera").addEventListener("click", () => {
  for (const campo of Object.values(campi)) campo.value = "";
  salvaFiltriNellIndirizzo();
  aggiorna();
});

// Bolle della testata: scelgono il periodo e portano alla mappa
document.querySelectorAll(".bolla").forEach((bolla) =>
  bolla.addEventListener("click", () => {
    campi.periodo.value = bolla.dataset.periodo;
    salvaFiltriNellIndirizzo();
    aggiorna({ spostaMappa: false });
    document.getElementById("esplora").scrollIntoView({ behavior: menoMovimento ? "auto" : "smooth" });
  }));

elenco.addEventListener("click", (e) => {
  const voce = e.target.closest("li[data-id]");
  if (voce) mostraSullaMappa(voce.dataset.id);
});
elenco.addEventListener("keydown", (e) => {
  const voce = e.target.closest("li[data-id]");
  if (voce && e.key === "Enter") mostraSullaMappa(voce.dataset.id);
});

// Se il dispositivo passa da tema chiaro a scuro (o viceversa), ricoloriamo le regioni
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aggiornaRegioni);


// =========================================================
// Avvio: carichiamo regioni e fiere insieme
// =========================================================

// Qui usiamo i confini "precisi", perché da vicino si vedono bene
Promise.all([caricaJSON("data/regioni-dettaglio.geojson"), caricaFiere()])
  .then(([regioni, dati]) => {
    tutteLeFiere = dati.fiere;
    document.getElementById("aggiornamento").textContent = testoAggiornamento(dati);

    disegnaRegioni(regioni);
    creaMaschera(regioni);
    // Nel menu mettiamo tutte e 20 le regioni (anche quelle senza fiere), come sulla mappa
    riempiMenu(campi.regione, regioni.features.map((r) => r.properties.nome).sort((a, b) => a.localeCompare(b, "it")));
    riempiMenu(campi.settore, valoriUnici(tutteLeFiere, "settore"));
    riempiMenu(campi.tipologia, valoriUnici(tutteLeFiere, "tipologia"));
    contaPerPeriodo();
    leggiFiltriDallIndirizzo();
    aggiorna({ anima: false });
  })
  .catch((errore) => {
    document.getElementById("aggiornamento").textContent = "Impossibile caricare i dati";
    elenco.innerHTML = `<li class="vuoto">Non è stato possibile caricare i dati (${sicuro(errore.message)}).</li>`;
  });
