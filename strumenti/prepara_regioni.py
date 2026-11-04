"""
prepara_regioni.py
==================
Scarica i confini delle 20 regioni italiane (dati ISTAT, progetto openpolis:
https://github.com/openpolis/geojson-italy) e crea una versione "alleggerita"
in data/regioni.geojson, che la pagina usa per disegnare l'Italia.

Va eseguito una volta sola (i confini delle regioni non cambiano):
    python strumenti/prepara_regioni.py

Il file originale pesa quasi 3 MB perché ha dettagli di pochi metri.
Per una mappa nazionale bastano molti meno punti: qui li riduciamo con
l'algoritmo di Douglas-Peucker, che toglie i punti "quasi in linea" con i vicini.
"""

import json
import urllib.request
from pathlib import Path

URL = "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson"
CARTELLA_DATI = Path(__file__).resolve().parent.parent / "data"

# Creiamo due versioni dei confini:
#  - "regioni.geojson": leggera, per vedere l'Italia intera (e per la pagina iniziale)
#  - "regioni-dettaglio.geojson": precisa, usata dalla cartina quando ci si avvicina
# TOLLERANZA = sotto questa distanza (in gradi) i punti si eliminano
# AREA_MINIMA = isolotti più piccoli di così non si disegnano
VERSIONI = [
    {"file": "regioni.geojson", "tolleranza": 0.004, "area_minima": 0.0004},             # ~400 m, isole > 3 km²
    {"file": "regioni-dettaglio.geojson", "tolleranza": 0.0006, "area_minima": 0.00002},  # ~60 m, isole > 0,15 km²
]
DECIMALI = 4            # 4 decimali = precisione di circa 10 metri, più che sufficiente

# I nomi ufficiali bilingui -> i nomi usati nel resto del sito
NOMI = {
    "Trentino-Alto Adige/Südtirol": "Trentino-Alto Adige",
    "Valle d'Aosta/Vallée d'Aoste": "Valle d'Aosta",
    "Friuli Venezia Giulia": "Friuli-Venezia Giulia",
}


def distanza_da_segmento(p, a, b):
    """Distanza del punto p dal segmento che va da a a b."""
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5


def semplifica(punti, tolleranza):
    """Algoritmo di Douglas-Peucker (versione senza ricorsione, per linee lunghe)."""
    if len(punti) < 3:
        return punti
    tenere = [False] * len(punti)
    tenere[0] = tenere[-1] = True
    da_fare = [(0, len(punti) - 1)]
    while da_fare:
        inizio, fine = da_fare.pop()
        distanza_max, indice = 0, None
        for i in range(inizio + 1, fine):
            d = distanza_da_segmento(punti[i], punti[inizio], punti[fine])
            if d > distanza_max:
                distanza_max, indice = d, i
        if indice is not None and distanza_max > tolleranza:
            tenere[indice] = True
            da_fare += [(inizio, indice), (indice, fine)]
    return [p for p, t in zip(punti, tenere) if t]


def area(anello):
    """Area (approssimata, in gradi²) di un anello di punti: formula di Gauss."""
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(anello, anello[1:]))) / 2


def semplifica_poligono(poligono, tolleranza, area_minima):
    """Un poligono è una lista di anelli: il primo è il contorno, gli altri sono i "buchi"."""
    risultato = []
    for anello in poligono:
        nuovo = semplifica(anello, tolleranza)
        if len(nuovo) >= 4 and area(nuovo) >= area_minima:
            risultato.append([[round(x, DECIMALI), round(y, DECIMALI)] for x, y in nuovo])
    return risultato


def main():
    print("Scarico i confini delle regioni...")
    with urllib.request.urlopen(URL, timeout=60) as risposta:
        dati = json.load(risposta)

    for versione in VERSIONI:
        regioni = []
        for f in dati["features"]:
            geometria = f["geometry"]
            poligoni = geometria["coordinates"] if geometria["type"] == "MultiPolygon" else [geometria["coordinates"]]
            poligoni = [p for p in (semplifica_poligono(p, versione["tolleranza"], versione["area_minima"])
                                    for p in poligoni) if p]
            nome = f["properties"]["reg_name"]
            regioni.append({
                "type": "Feature",
                "properties": {"nome": NOMI.get(nome, nome)},
                "geometry": {"type": "MultiPolygon", "coordinates": poligoni},
            })

        destinazione = CARTELLA_DATI / versione["file"]
        destinazione.write_text(
            json.dumps({"type": "FeatureCollection", "features": regioni}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        print(f"Fatto: {destinazione} ({destinazione.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
