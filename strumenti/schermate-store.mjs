// Strumento di lavoro (NON pubblicato): fa le "schermate" per la scheda Google Play.
// Apre Chrome "headless" (invisibile) facendo finta di essere un telefono 360×640 con
// schermo a densità 3 → immagini 1080×1920, come vuole Google Play.
// Uso:  node strumenti/schermate-store.mjs
// Le immagini finiscono in negozio/app-store/schermata-*.png

import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SITO = "https://tassomattia2-ai.github.io/fiere-in-mappa/";
const CARTELLA = new URL("../negozio/app-store/", import.meta.url);

// Le schermate da fare: nome del file, pagina, e (facoltativo) cosa fare prima della foto
const SCHERMATE = [
  { nome: "index", pagina: "index.html" },
  { nome: "mappa", pagina: "mappa.html" },
  // la mappa vera e propria: scorriamo fino al riquadro con la cartina
  { nome: "cartina", pagina: "mappa.html",
    prima: "document.querySelector('#mappa, .leaflet-container')?.scrollIntoView({block:'center'})" },
  // l'elenco delle fiere sotto la mappa
  { nome: "elenco", pagina: "mappa.html",
    prima: "document.querySelector('#elenco, .elenco, .lista-fiere')?.scrollIntoView({block:'start'})" },
];

const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Avvia Chrome invisibile con la "porta di controllo" aperta
const profilo = mkdtempSync(join(tmpdir(), "chrome-store-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=9333", `--user-data-dir=${profilo}`, "about:blank"]);
await aspetta(2500);

// 2) Trova la scheda aperta e collegati
const schede = await (await fetch("http://127.0.0.1:9333/json")).json();
const ws = new WebSocket(schede.find((s) => s.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

// Piccolo aiuto per mandare un comando a Chrome e aspettare la risposta
let id = 0;
function comando(method, params = {}) {
  const mio = ++id;
  ws.send(JSON.stringify({ id: mio, method, params }));
  return new Promise((risolvi) => {
    ws.addEventListener("message", function ascolta(e) {
      const m = JSON.parse(e.data);
      if (m.id === mio) { ws.removeEventListener("message", ascolta); risolvi(m.result); }
    });
  });
}

// 3) Fingi di essere un telefono
await comando("Emulation.setDeviceMetricsOverride",
  { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
await comando("Emulation.setEmulatedMedia",
  { features: [{ name: "prefers-color-scheme", value: "light" }] });

// 4) Per ogni schermata: apri la pagina, aspetta che carichi (font, mappa), scatta
for (const s of SCHERMATE) {
  await comando("Page.navigate", { url: SITO + s.pagina + "?v=store" });
  await aspetta(6000);
  if (s.prima) {
    await comando("Runtime.evaluate", { expression: s.prima });
    await aspetta(3000);
  }
  const foto = await comando("Page.captureScreenshot", { format: "png" });
  writeFileSync(new URL(`schermata-${s.nome}.png`, CARTELLA), Buffer.from(foto.data, "base64"));
  console.log("fatta:", s.nome);
}

ws.close();
chrome.kill();
