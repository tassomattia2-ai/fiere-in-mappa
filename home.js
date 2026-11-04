// =========================================================
// home.js – codice della pagina iniziale (index.html)
//   1. scrive quante fiere ci sono nei prossimi 30 giorni
//   2. disegna l'Italia "galleggiante" a partire dai confini delle regioni
// (parallax e animazioni sono in comune.js)
// =========================================================

// --- 1. Numero di fiere e data di aggiornamento ---
caricaFiere()
  .then((dati) => {
    const n = dati.fiere.length;
    document.getElementById("numero-fiere").textContent =
      `In questo momento ce ne sono ${n}.`;
    document.getElementById("aggiornamento").textContent = testoAggiornamento(dati);
  })
  .catch(() => { /* se i dati non arrivano, la pagina resta comunque leggibile */ });


// --- 2. L'Italia disegnata con le sue regioni ---
// I confini sono in gradi (longitudine, latitudine): li trasformiamo in
// coordinate da 0 a 100 per il disegno SVG.
caricaJSON("data/regioni.geojson")
  .then((regioni) => {
    const svg = document.getElementById("italia");
    const OVEST = 6.6, EST = 18.6, NORD = 47.1, SUD = 35.5;
    // In Italia un grado di longitudine è più "corto" di uno di latitudine (circa ×0,77)
    const scala = 100 / (NORD - SUD);
    const larghezza = (EST - OVEST) * 0.77 * scala;
    const spostamento = (100 - larghezza) / 2;   // per centrare il disegno

    const punto = ([lng, lat]) =>
      `${(spostamento + (lng - OVEST) * 0.77 * scala).toFixed(2)},${((NORD - lat) * scala).toFixed(2)}`;

    let disegno = "";
    for (const regione of regioni.features) {
      const percorso = regione.geometry.coordinates
        .map((poligono) => poligono.map((anello) => "M" + anello.map(punto).join("L") + "Z").join(""))
        .join("");
      disegno += `<path d="${percorso}"><title>${regione.properties.nome}</title></path>`;
    }
    svg.innerHTML = disegno;
  })
  .catch(() => { /* il disegno è solo decorativo */ });
