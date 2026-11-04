// =========================================================
// news.js – la sezione "News dalle fiere" della pagina mappa.html
//
// Le news sono nel file data/news.json, scritte da noi con parole nostre
// e sempre con la fonte. Qui le mostriamo come schede, ma SOLO quelle di fiere
// in corso o che iniziano entro 30 giorni: le news delle fiere già finite
// spariscono da sole, senza dover toccare il file.
//
// Questo file è separato da app.js apposta: la sezione news non tocca
// la mappa né l'elenco delle fiere.
// =========================================================

(function () {
  const contenitore = document.getElementById("elenco-news");
  const scelte = document.querySelectorAll(".scelte-news button");
  if (!contenitore) return;

  // Le news pronte da mostrare (si riempie dopo il caricamento)
  let tutteLeNews = [];
  // Periodo scelto: "oggi" (In corso), "settimana" (Prossimi 7 giorni), "" (Prossimi 30 giorni).
  // Le news hanno le LORO tre pillole, slegate dal menu "Periodo" della pagina
  // (deciso dall'utente il 12/10/2026, dopo averle provate allineate).
  let periodoScelto = "";

  // Evita che un testo venga letto come codice HTML
  function pulito(testo) {
    return String(testo ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // "2026-10-22" → "22 ott"
  function giornoBreve(testo) {
    return new Date(testo + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  }

  // Quanti giorni mancano dall'oggi a una data "AAAA-MM-GG"
  function giorniDaOggi(testo) {
    const a = new Date(oggi + "T12:00:00");
    const b = new Date(testo + "T12:00:00");
    return Math.round((b - a) / 86400000);
  }

  function fieraInCorso(fiera) {
    return fiera.inizio <= oggi && fiera.fine >= oggi;
  }

  // Stessa regola dei periodi della mappa (decisa dall'utente):
  // le fiere in corso compaiono nei 7 / 30 giorni solo se finiscono entro quel periodo
  function nelPeriodoScelto(fiera) {
    if (periodoScelto === "oggi") return fieraInCorso(fiera);
    const limite = oggiPiuGiorni(periodoScelto === "settimana" ? 7 : GIORNI_MASSIMI);
    if (fieraInCorso(fiera)) return fiera.fine <= limite;
    return fiera.inizio <= limite;
  }

  // L'etichetta colorata in alto a sinistra di ogni scheda
  function etichettaStato(fiera) {
    if (fieraInCorso(fiera)) return '<span class="etichetta in-corso">In corso</span>';
    const giorni = giorniDaOggi(fiera.inizio);
    const testo = giorni === 1 ? "Domani" : `Tra ${giorni} giorni`;
    return `<span class="etichetta">${testo}</span>`;
  }

  // Disegna le schede delle news del periodo scelto
  function disegnaNews() {
    // La pillola del periodo scelto risulta "premuta"
    scelte.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.periodo === periodoScelto)));

    const daMostrare = tutteLeNews.filter((n) => nelPeriodoScelto(n.fiera));

    if (!daMostrare.length) {
      contenitore.innerHTML = '<li class="vuoto">Nessuna news per le fiere di questo periodo, per ora.</li>';
      return;
    }

    contenitore.innerHTML = daMostrare.map((n, i) => {
      const f = n.fiera;
      const date = f.inizio === f.fine ? giornoBreve(f.inizio) : `${giornoBreve(f.inizio)} – ${giornoBreve(f.fine)}`;
      const sito = n.fonte ? new URL(n.fonte).hostname.replace(/^www\./, "") : "";
      return `
        <li class="scheda-news rivela${fieraInCorso(f) ? " in-corso" : ""}" style="--ritardo:${(i % 3) * 90}ms">
          <p class="news-fiera">${etichettaStato(f)}<strong>${pulito(f.nome)}</strong></p>
          <p class="news-quando">${pulito(date)} · ${pulito(f.citta || "")}</p>
          <h3>${pulito(n.titolo)}</h3>
          <p class="news-testo">${pulito(n.testo)}</p>
          <p class="news-fonte">
            Fonte: <a href="${pulito(n.fonte)}" target="_blank" rel="noopener">${pulito(n.testata || sito)}</a>
          </p>
        </li>`;
    }).join("");

    osservaRivela(contenitore);   // le schede "salgono" mentre si scorre (vedi comune.js)
  }

  // Clic su una delle tre pillole: cambia SOLO le news (mappa ed elenco restano come sono)
  scelte.forEach((bottone) => {
    bottone.addEventListener("click", () => {
      periodoScelto = bottone.dataset.periodo;
      disegnaNews();
    });
  });

  // Carica fiere e news insieme, poi abbina ogni news alla sua fiera
  Promise.all([caricaFiere(), caricaJSON("data/news.json")])
    .then(([datiFiere, datiNews]) => {
      // Le fiere visibili, cercabili per nome (in minuscolo)
      const perNome = new Map();
      for (const f of datiFiere.fiere) {
        const chiave = f.nome.trim().toLowerCase();
        if (!perNome.has(chiave)) perNome.set(chiave, f);
      }

      tutteLeNews = (datiNews.news || [])
        .map((n) => ({ ...n, fiera: perNome.get(String(n.fiera).trim().toLowerCase()) }))
        .filter((n) => n.fiera)                                   // fiera finita o lontana: niente news
        .sort((a, b) => a.fiera.inizio.localeCompare(b.fiera.inizio) || a.fiera.nome.localeCompare(b.fiera.nome, "it"));

      disegnaNews();
    })
    .catch((errore) => {
      console.error(errore);
      contenitore.innerHTML = '<li class="vuoto">Non è stato possibile caricare le news.</li>';
    });
})();
