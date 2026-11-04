// =========================================================
// banda.js – la "banda" scorrevole con i nomi delle fiere (mappa.html),
// tra le news e il piè di pagina.
//
// Scelta dell'utente (12/10/2026): NIENTE loghi né marchi delle aziende (diritti),
// solo i NOMI delle fiere scritti con il nostro carattere. Si aggiorna da sola
// con i dati e segue il periodo scelto nel menu "Periodo" (come mappa, elenco e news).
// Cliccando un nome si va alla scheda di quella fiera nell'elenco.
// =========================================================

(function () {
  const nastro = document.getElementById("banda-nastro");
  const menuPeriodo = document.getElementById("filtro-periodo");
  if (!nastro) return;

  let fiere = [];   // tutte le fiere dei prossimi 30 giorni (si riempie dopo il caricamento)

  function pulito(testo) {
    return String(testo ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // "2026-10-22" → "22 ott"
  function giornoBreve(testo) {
    return new Date(testo + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }).replace(".", "");
  }

  // Stessa regola dei periodi della mappa (vedi app.js e news.js)
  function nelPeriodo(fiera, periodo) {
    const inCorsoOra = fiera.inizio <= oggi && fiera.fine >= oggi;
    if (periodo === "oggi") return inCorsoOra;
    const limite = oggiPiuGiorni(periodo === "settimana" ? 7 : GIORNI_MASSIMI);
    return inCorsoOra ? fiera.fine <= limite : fiera.inizio <= limite;
  }

  function disegnaBanda() {
    const periodo = menuPeriodo ? menuPeriodo.value : "";
    const delPeriodo = fiere.filter((f) => nelPeriodo(f, periodo));
    // Le più note: quelle internazionali. Se nel periodo non ce ne sono, tutte quelle del periodo.
    const internazionali = delPeriodo.filter((f) => f.tipologia === "Internazionale");
    const scelte = (internazionali.length ? internazionali : delPeriodo)
      .sort((a, b) => a.inizio.localeCompare(b.inizio) || a.nome.localeCompare(b.nome, "it"));

    if (!scelte.length) { nastro.innerHTML = ""; nastro.closest("section").hidden = true; return; }
    nastro.closest("section").hidden = false;

    const voci = scelte.map((f) => `
      <button type="button" class="banda-voce" data-id="${pulito(f.id)}"
              title="${pulito(f.nome)} · ${pulito(f.citta || "")}">
        <strong>${pulito(f.nome)}</strong><span>${pulito(giornoBreve(f.inizio))}</span>
      </button>`).join('<span class="banda-punto" aria-hidden="true">•</span>');

    // Il nastro contiene due copie identiche una dopo l'altra: quando la prima
    // è uscita del tutto a sinistra, l'animazione riparte e non si vede lo "stacco".
    // La seconda copia è solo decorativa (nascosta ai lettori di schermo).
    nastro.innerHTML = `<div class="banda-copia">${voci}<span class="banda-punto" aria-hidden="true">•</span></div>`
                     + `<div class="banda-copia" aria-hidden="true">${voci}<span class="banda-punto">•</span></div>`;
    nastro.querySelectorAll('[aria-hidden="true"] button').forEach((b) => (b.tabIndex = -1));

    // Velocità costante: circa 3,5 secondi per ogni fiera
    nastro.style.setProperty("--durata", `${Math.max(20, scelte.length * 3.5)}s`);
  }

  // Clic su un nome: si va alla sua scheda nell'elenco e la si evidenzia per un momento.
  // Se la scheda non c'è (nascosta da altri filtri), si apre la fiera sulla mappa.
  nastro.addEventListener("click", (e) => {
    const voce = e.target.closest(".banda-voce");
    if (!voce) return;
    const scheda = document.querySelector(`#elenco li[data-id="${CSS.escape(voce.dataset.id)}"]`);
    if (scheda) {
      scheda.scrollIntoView({ behavior: menoMovimento ? "auto" : "smooth", block: "center" });
      scheda.classList.remove("dalla-banda");
      void scheda.offsetWidth;                 // fa ripartire l'animazione se si riclicca
      scheda.classList.add("dalla-banda");
      scheda.focus({ preventScroll: true });
    } else if (typeof mostraSullaMappa === "function") {
      mostraSullaMappa(voce.dataset.id);
    }
  });

  // Quando cambia il periodo (menu, bolle della testata, "Azzera filtri", pillole delle news)
  if (menuPeriodo) menuPeriodo.addEventListener("change", disegnaBanda);
  document.querySelectorAll(".bolla").forEach((b) => b.addEventListener("click", disegnaBanda));
  document.getElementById("azzera")?.addEventListener("click", disegnaBanda);

  caricaFiere()
    .then((dati) => { fiere = dati.fiere; disegnaBanda(); })
    .catch((errore) => { console.error(errore); nastro.closest("section").hidden = true; });
})();
