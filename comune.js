// =========================================================
// comune.js – codice usato da TUTTE le pagine del sito
//   1. l'effetto parallax (strati che scorrono a velocità diverse)
//   2. gli elementi che "compaiono" mentre si scorre la pagina
//   3. la barra in alto che diventa piena quando si scorre
//   4. funzioni di aiuto per date e dati
//   5. l'app per smartphone (installazione e uso senza rete)
// =========================================================

// Il sito mostra solo le fiere in corso o che iniziano entro questo numero di giorni
const GIORNI_MASSIMI = 30;

// Se la persona ha chiesto al computer di ridurre le animazioni, le rispettiamo
const menoMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;


// ---------------------------------------------------------
// 1. Parallax
// ---------------------------------------------------------
// Ogni elemento con l'attributo data-velocita="0.3" si sposta del 30%
// di quanto è stata scorsa la sua sezione: così sembra più lontano.
// Con un numero negativo si muove nel verso opposto (sembra più vicino).

const elementiParallax = [...document.querySelectorAll("[data-velocita]")];

function aggiornaParallax() {
  for (const el of elementiParallax) {
    const sezione = el.closest("section") || document.body;
    const quantoScorsa = -sezione.getBoundingClientRect().top;   // pixel di sezione già scorsi
    const velocita = parseFloat(el.dataset.velocita);
    el.style.transform = `translate3d(0, ${(quantoScorsa * velocita).toFixed(1)}px, 0)`;
  }

  // Il testo dell'apertura si dissolve piano piano mentre la pagina sale
  const testoApertura = document.querySelector(".apertura-testo");
  if (testoApertura) {
    const altezza = testoApertura.closest("section").offsetHeight;
    testoApertura.style.opacity = Math.max(0, 1 - scrollY / (altezza * 0.55)).toFixed(2);
  }
}

// Il calcolo si fa al massimo una volta per "fotogramma" dello schermo, per restare fluido
let calcoloInAttesa = false;
function alloScorrimento() {
  if (calcoloInAttesa) return;
  calcoloInAttesa = true;
  requestAnimationFrame(() => {
    if (!menoMovimento) aggiornaParallax();
    aggiornaBarraAlta();
    calcoloInAttesa = false;
  });
}
addEventListener("scroll", alloScorrimento, { passive: true });
addEventListener("resize", alloScorrimento);


// ---------------------------------------------------------
// 2. Elementi che compaiono durante lo scorrimento
// ---------------------------------------------------------
// Gli elementi con la classe "rivela" partono invisibili e un po' più in basso;
// quando entrano nello schermo ricevono la classe "visibile" e salgono al loro posto.

const osservatore = new IntersectionObserver((voci) => {
  for (const voce of voci) {
    if (voce.isIntersecting) {
      voce.target.classList.add("visibile");
      osservatore.unobserve(voce.target);   // una volta comparso, resta visibile
    }
  }
}, { threshold: 0.12 });

// Da chiamare anche per gli elementi creati dopo (es. le schede delle fiere)
function osservaRivela(contenitore = document) {
  contenitore.querySelectorAll(".rivela:not(.visibile)").forEach((el) => {
    if (menoMovimento) el.classList.add("visibile");
    else osservatore.observe(el);
  });
}
osservaRivela();


// ---------------------------------------------------------
// 3. Barra in alto
// ---------------------------------------------------------
const barraAlta = document.getElementById("barra-alta");
function aggiornaBarraAlta() {
  const scorsa = scrollY > 40;
  if (barraAlta) {
    barraAlta.classList.toggle("piena", scorsa);
    // L'altezza della barra serve alla fascia dei filtri per attaccarsi subito sotto
    document.documentElement.style.setProperty("--altezza-barra", `${barraAlta.offsetHeight}px`);
  }
  // La classe "scorsa" sulla pagina nasconde l'invito a scorrere (vedi style.css)
  document.documentElement.classList.toggle("scorsa", scorsa);
}

// La barra cambia altezza con un'animazione: alla fine la rimisuriamo
if (barraAlta) barraAlta.addEventListener("transitionend", aggiornaBarraAlta);

// Primo calcolo appena la pagina è pronta
alloScorrimento();


// ---------------------------------------------------------
// 4. Funzioni di aiuto
// ---------------------------------------------------------

// Trasforma una data in testo "AAAA-MM-GG" (lo stesso formato del file dati),
// usando l'ora italiana del dispositivo e non quella di Greenwich
function comeTesto(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const oggi = comeTesto(new Date());

// La data di oggi più N giorni, come "AAAA-MM-GG"
function oggiPiuGiorni(giorni) {
  const d = new Date();
  d.setDate(d.getDate() + giorni);
  return comeTesto(d);
}

// Siamo dentro l'app Android? (l'app è fatta con Capacitor, che aggiunge "window.Capacitor")
const NELL_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// Nell'app le pagine stanno DENTRO l'app, ma questi dati cambiano ogni giorno:
// li prendiamo sempre dal sito (deciso il 2/11/2026), così l'app è aggiornata
// senza dover pubblicare nuove versioni sul Play Store
const SITO = "https://fiereinmappa.it/";
const DATI_DAL_SITO = ["data/fiere.json", "data/news.json"];

// Scarica un file JSON (es. data/fiere.json). "no-cache": il browser deve
// sempre controllare se il file è cambiato, invece di usare una copia vecchia
function caricaJSON(indirizzo) {
  if (NELL_APP && DATI_DAL_SITO.includes(indirizzo)) return caricaDalSito(indirizzo);
  return fetch(indirizzo, { cache: "no-cache" }).then((risposta) => {
    if (!risposta.ok) throw new Error(`${indirizzo}: errore ${risposta.status}`);
    return risposta.json();
  });
}

// Solo nell'app: scarica i dati dal sito e ne tiene una copia sul telefono.
// Senza internet usa l'ultima copia scaricata; se non c'è ancora (primo avvio
// senza rete) usa i dati messi dentro l'app quando è stata creata.
function caricaDalSito(indirizzo) {
  const chiave = "copia:" + indirizzo;
  return fetch(SITO + indirizzo, { cache: "no-cache" })
    .then((risposta) => {
      if (!risposta.ok) throw new Error(`${indirizzo}: errore ${risposta.status}`);
      return risposta.json();
    })
    .then((dati) => {
      try { localStorage.setItem(chiave, JSON.stringify(dati)); } catch (e) { /* memoria piena: pazienza */ }
      return dati;
    })
    .catch(() => {
      try {
        const copia = localStorage.getItem(chiave);
        if (copia) return JSON.parse(copia);
      } catch (e) { /* copia rovinata: usiamo quella dentro l'app */ }
      return fetch(indirizzo).then((risposta) => risposta.json());
    });
}

// Carica le fiere e tiene solo quelle non ancora finite che iniziano entro GIORNI_MASSIMI
function caricaFiere() {
  return caricaJSON("data/fiere.json").then((dati) => {
    const limite = oggiPiuGiorni(GIORNI_MASSIMI);
    dati.fiere = dati.fiere.filter((f) => f.fine >= oggi && f.inizio <= limite);
    return dati;
  });
}

// "Aggiornato al 15 ottobre 2026", "Aggiornato all'8 ottobre 2026", "Aggiornato al 1° novembre 2026"
// (in italiano davanti a 8 e 11, che iniziano per vocale, si scrive "all'")
function testoAggiornamento(dati) {
  const data = new Date(dati.aggiornato);
  const giorno = data.getDate();
  const meseEAnno = data.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const giornoScritto = giorno === 1 ? "1°" : String(giorno);
  const preposizione = giorno === 8 || giorno === 11 ? "all'" : "al ";
  return `Aggiornato ${preposizione}${giornoScritto} ${meseEAnno}`;
}


// ---------------------------------------------------------
// 5. App per smartphone
// ---------------------------------------------------------
// Il sito si può "installare" sul telefono: compare un'icona nella schermata Home
// e si apre a schermo intero come un'app. Il file sw.js lo fa funzionare anche senza rete.
// (Funziona solo su un sito "https" o su localhost: altrove il telefono lo ignora.)
// Nell'app Android non serve: le pagine sono già dentro l'app.
if ("serviceWorker" in navigator && !NELL_APP) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* niente https: il sito funziona lo stesso */ });
}

// Pulsante "Installa l'app" (c'è solo nella pagina iniziale)
const pulsanteInstalla = document.getElementById("installa-app");
const aiutoInstalla = document.getElementById("aiuto-installa");
const giaInstallata = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const suIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
let richiestaInstallazione = null;   // la "domanda di installazione" preparata da Android/Chrome

// (Nell'app Android il pulsante resta nascosto: l'app è già installata)
if (pulsanteInstalla && !giaInstallata && !NELL_APP) {
  // Android e computer (Chrome, Edge): il browser ci avvisa quando l'app si può installare
  addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();           // la domanda la mostriamo noi, quando si clicca il pulsante
    richiestaInstallazione = evento;
    pulsanteInstalla.hidden = false;
  });
  // iPhone: non esiste la domanda automatica, quindi il pulsante mostra le istruzioni
  if (suIphone) pulsanteInstalla.hidden = false;

  pulsanteInstalla.addEventListener("click", () => {
    if (richiestaInstallazione) {
      richiestaInstallazione.prompt();
      richiestaInstallazione.userChoice.then(() => { richiestaInstallazione = null; });
    } else if (aiutoInstalla) {
      aiutoInstalla.hidden = !aiutoInstalla.hidden;
    }
  });
  // Installata: il pulsante non serve più
  addEventListener("appinstalled", () => { pulsanteInstalla.hidden = true; });
}
// Un clic sulle istruzioni le chiude
if (aiutoInstalla) aiutoInstalla.addEventListener("click", () => { aiutoInstalla.hidden = true; });
