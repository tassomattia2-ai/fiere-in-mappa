"""
aggiorna_fiere.py
=================
Questo programma raccoglie le fiere italiane dal calendario ufficiale AEFI
(https://www.aefi.it/it/calendario/) e le salva nel file data/fiere.json,
che poi la pagina web legge per disegnare la mappa.

Come si usa (dalla cartella "mappa-fiere"):
    python strumenti/aggiorna_fiere.py

Cosa fa, passo per passo:
  1. Legge le pagine del calendario AEFI dei mesi che servono
     (da oggi fino a GIORNI_DA_RACCOGLIERE giorni nel futuro).
  2. Per ogni fiera apre la sua scheda per sapere settore, luogo e sito web.
  3. Trova le coordinate (latitudine/longitudine) per metterla sulla mappa.
  4. Tiene solo le fiere in Italia, in corso o che iniziano entro quel periodo.
  5. Scrive tutto in data/fiere.json.

Usa solo moduli già inclusi in Python: non serve installare nulla.
"""

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Impostazioni generali
# ---------------------------------------------------------------------------

# Cartelle e file del progetto (calcolati a partire da dove si trova questo file)
CARTELLA_PROGETTO = Path(__file__).resolve().parent.parent
FILE_FIERE = CARTELLA_PROGETTO / "data" / "fiere.json"
FILE_CACHE = CARTELLA_PROGETTO / "strumenti" / "cache_schede.json"

URL_CALENDARIO = "https://www.aefi.it/it/calendario/"

# Ci presentiamo ai siti che visitiamo (è buona educazione, e Nominatim lo richiede)
INTESTAZIONI = {"User-Agent": "MappaFiereItalia/1.0 (progetto amatoriale, dati AEFI)"}

# Pausa tra una richiesta e l'altra, per non sovraccaricare il sito AEFI
PAUSA_SECONDI = 0.4

# Quanti giorni nel futuro raccogliere. Il sito ne mostra al massimo 30,
# ma l'aggiornamento è settimanale: con 45 giorni il sito resta "coperto"
# per 30 giorni pieni anche alla fine della settimana.
GIORNI_DA_RACCOGLIERE = 45

# Tipologie di fiera usate da AEFI ("ABROAD" = fiere all'estero, che escludiamo)
TIPOLOGIE = {
    "INTERNATIONAL": "Internazionale",
    "NATIONAL": "Nazionale",
    "REGIONAL": "Regionale",
    "LOCAL": "Locale",
}

MESI = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}

# Correzioni a mano: quartieri fieristici con coordinate sbagliate sul sito AEFI.
# Le posizioni giuste sono state verificate su OpenStreetMap (5 ottobre 2026).
CORREZIONI_QUARTIERI = {
    "FIERE DI PARMA S.P.A.": (44.8465, 10.2934),   # AEFI lo mette 16 km più a nord
    "PIACENZA EXPO S.P.A.": (45.0421, 9.7542),     # AEFI lo mette 8 km più a nord
}

# Correzioni a mano per singole fiere: dati che AEFI non indica o indica male.
# La chiave è il nome della fiera in minuscolo (vale per tutte le edizioni, anno dopo anno).
# Campi possibili: "sito" (sito dell'organizzatore), "sito_fiera", "organizzatore" (nome),
# "settore", "citta", "provincia", "lat", "lng", e "date" (date giuste di UNA edizione, indicata con
# l'anno: {"2026": ("AAAA-MM-GG inizio", "AAAA-MM-GG fine")}).
# Tutti i siti sono stati controllati a mano il 7 ottobre 2026.
CORREZIONI_FIERE = {
    "merano winefestival": {
        "sito": "https://meranowinefestival.com/", "sito_fiera": "https://meranowinefestival.com/"},
    "romasposa": {
        "sito": "https://www.romasposa.it/"},
    "salerno boat show": {
        "sito": "https://www.salernoboatshow.com/", "sito_fiera": "https://www.salernoboatshow.com/"},
    "snim - salone nautico di puglia": {
        "sito": "https://www.snimpuglia.it/", "sito_fiera": "https://www.snimpuglia.it/"},
    "bmii - bridal & tourism in italy": {
        "sito": "https://www.borsadelmatrimonioinitalia.it/", "sito_fiera": "https://www.borsadelmatrimonioinitalia.it/"},
    "fiera nazionale di lagopesole - città di avigliano": {
        "sito": "https://www.fierelucane.it/"},
    "eurochocolate": {
        "sito_fiera": "https://www.eurochocolate.com/"},
    # Fiere per cui AEFI scrive "-" al posto del sito
    "promessi sposi - il matrimonio in vetrina": {
        "sito": "https://www.pubblivela.it/"},
    "pescara sposi": {
        "sito": "https://www.pescarasposi.it/", "sito_fiera": "https://www.pescarasposi.it/",
        # AEFI indica "dal 10 ottobre", il sito ufficiale dice 3-4 ottobre 2026 (scelto l'8/10/2026)
        "date": {"2026": ("2026-10-03", "2026-10-04")}},
    "mostra nazionale del tartufo bianco pregiato delle marche": {
        "sito": "https://www.mostratartufo.it/", "sito_fiera": "https://www.mostratartufo.it/"},
    "abruzzo sposi": {
        "sito": "https://www.abruzzosposi.it/", "sito_fiera": "https://www.abruzzosposi.it/"},
    "gift fair": {
        "sito": "https://www.emil.it/"},
    "gepi expo": {
        "sito": "https://www.gepiexpo.it/", "sito_fiera": "https://www.gepiexpo.it/"},
    "reining futurity": {
        "sito": "https://www.teamforyou.net/"},
    "futurity & country christmas": {
        "sito": "https://www.teamforyou.net/"},
    "astroshow": {
        "sito": "https://www.astroshowcesena.it/", "sito_fiera": "https://www.astroshowcesena.it/"},
    "padelness": {
        "sito": "https://www.padelness.it/", "sito_fiera": "https://www.padelness.it/"},
    # La scheda AEFI di questa fiera è guasta ("dati non disponibili"): mancano luogo e organizzatore
    "fiera nazionale del tartufo bianco pregiato": {
        "sito": "https://www.prolocosantagatafeltria.com/", "organizzatore": "Pro Loco di Sant'Agata Feltria",
        "citta": "Sant'Agata Feltria", "provincia": "RN", "lat": 43.8643, "lng": 12.2080},
    # AEFI scrive solo "San Ferdinando": è San Ferdinando di PUGLIA, non quello in Calabria
    "fiera del carciofo mediterraneo e del prodotto ortofrutticolo": {
        "sito": "https://comune.sanferdinandodipuglia.bt.it/",
        "citta": "San Ferdinando di Puglia", "provincia": "BT", "lat": 41.3026, "lng": 16.0705},
    # Organizzatori e settori mancanti su AEFI, cercati e verificati a mano l'8 ottobre 2026
    "pharm evolution": {
        "sito": "https://www.pharmevolution.it/", "sito_fiera": "https://www.pharmevolution.it/",
        "organizzatore": "Farmacia Servizi Srl",   # scritto in fondo al sito ufficiale
        "settore": "Attrezzature e Prodotti Medico-Ospedalieri"},
    "saperi&sapori fvg": {
        # Promossa dalla Regione FVG con Udine Esposizioni e altri partner (fonte: intrieste.com)
        "organizzatore": "Regione Friuli Venezia Giulia con Udine Esposizioni"},
    "abs eurepe adhesives bonding & sealants": {
        "organizzatore": "A151 Srl e Italian Exhibition Group"},
    "fine – winetuorism marketplace italy": {
        "organizzatore": "Riva del Garda Fierecongressi e Feria de Valladolid"},
    "antiquaria padova": {
        "organizzatore": "Nord Est Fair Srl"},
    "casalia - salone dell'arredamento e delle idee per abitare": {
        "settore": "Mobili e Arredamento per Casa e Ufficio"},
    # AEFI la mette tra i gioielli, ma AURA è un evento sul turismo di lusso
    "aura": {
        "settore": "Turismo e tempo libero"},
    # AEFI non indica nessun sito: mettiamo la pagina della fiera del Comune di Perugia
    "la fiera dei morti anche in centro": {
        "sito_fiera": "https://turismo.comune.perugia.it/poi/fiera-dei-morti-eng"},
}

# Il settore giusto per le fiere che su AEFI non ce l'hanno (aggiunto alla tabella sopra)
CORREZIONI_FIERE["fiera nazionale del tartufo bianco pregiato"]["settore"] = "Alimenti Bevande e Relative Tecnologie"

# Brevi riassunti scritti a mano (cercando sul web) per le fiere senza descrizione:
# vedi data/riassunti.json. La chiave è il nome in minuscolo; se due fiere hanno lo
# stesso nome si può aggiungere la città tra parentesi, es. "fiera di san martino (chieri)".
FILE_RIASSUNTI = CARTELLA_PROGETTO / "data" / "riassunti.json"

# I confini delle regioni (gli stessi disegnati sulla cartina del sito)
FILE_REGIONI = CARTELLA_PROGETTO / "data" / "regioni-dettaglio.geojson"


def sito_valido(indirizzo):
    """Tiene un sito solo se sembra un indirizzo web vero (es. scarta "-" o "nessuno")."""
    if indirizzo and re.search(r"[\w-]+\.[a-z]{2,}", indirizzo, re.I):
        return indirizzo.strip()
    return None


def chiave_fiera(nome):
    """Il nome di una fiera ridotto a "chiave" per la tabella delle correzioni."""
    return re.sub(r"\s+", " ", nome).strip().lower()


# Sigla della provincia -> regione. Serve per sapere in che regione è ogni fiera.
PROVINCE_REGIONI = {
    "AG": "Sicilia", "AL": "Piemonte", "AN": "Marche", "AO": "Valle d'Aosta", "AP": "Marche",
    "AQ": "Abruzzo", "AR": "Toscana", "AT": "Piemonte", "AV": "Campania", "BA": "Puglia",
    "BG": "Lombardia", "BI": "Piemonte", "BL": "Veneto", "BN": "Campania", "BO": "Emilia-Romagna",
    "BR": "Puglia", "BS": "Lombardia", "BT": "Puglia", "BZ": "Trentino-Alto Adige",
    "CA": "Sardegna", "CB": "Molise", "CE": "Campania", "CH": "Abruzzo", "CI": "Sardegna",
    "CL": "Sicilia", "CN": "Piemonte", "CO": "Lombardia", "CR": "Lombardia", "CS": "Calabria",
    "CT": "Sicilia", "CZ": "Calabria", "EN": "Sicilia", "FC": "Emilia-Romagna", "FE": "Emilia-Romagna",
    "FG": "Puglia", "FI": "Toscana", "FM": "Marche", "FR": "Lazio", "GE": "Liguria",
    "GO": "Friuli-Venezia Giulia", "GR": "Toscana", "IM": "Liguria", "IS": "Molise", "KR": "Calabria",
    "LC": "Lombardia", "LE": "Puglia", "LI": "Toscana", "LO": "Lombardia", "LT": "Lazio",
    "LU": "Toscana", "MB": "Lombardia", "MC": "Marche", "ME": "Sicilia", "MI": "Lombardia",
    "MN": "Lombardia", "MO": "Emilia-Romagna", "MS": "Toscana", "MT": "Basilicata", "NA": "Campania",
    "NO": "Piemonte", "NU": "Sardegna", "OG": "Sardegna", "OR": "Sardegna", "OT": "Sardegna",
    "PA": "Sicilia", "PC": "Emilia-Romagna", "PD": "Veneto", "PE": "Abruzzo", "PG": "Umbria",
    "PI": "Toscana", "PN": "Friuli-Venezia Giulia", "PO": "Toscana", "PR": "Emilia-Romagna",
    "PT": "Toscana", "PU": "Marche", "PV": "Lombardia", "PZ": "Basilicata", "RA": "Emilia-Romagna",
    "RC": "Calabria", "RE": "Emilia-Romagna", "RG": "Sicilia", "RI": "Lazio", "RM": "Lazio",
    "RN": "Emilia-Romagna", "RO": "Veneto", "SA": "Campania", "SI": "Toscana", "SO": "Lombardia",
    "SP": "Liguria", "SR": "Sicilia", "SS": "Sardegna", "SU": "Sardegna", "SV": "Liguria",
    "TA": "Puglia", "TE": "Abruzzo", "TN": "Trentino-Alto Adige", "TO": "Piemonte", "TP": "Sicilia",
    "TR": "Umbria", "TS": "Friuli-Venezia Giulia", "TV": "Veneto", "UD": "Friuli-Venezia Giulia",
    "VA": "Lombardia", "VB": "Piemonte", "VC": "Piemonte", "VE": "Veneto", "VI": "Veneto",
    "VR": "Veneto", "VS": "Sardegna", "VT": "Lazio", "VV": "Calabria",
}


# ---------------------------------------------------------------------------
# Funzioni di aiuto
# ---------------------------------------------------------------------------

def scarica(url):
    """Scarica una pagina web e restituisce il suo testo (HTML)."""
    time.sleep(PAUSA_SECONDI)
    # Alcuni indirizzi contengono spazi o lettere accentate: li "codifichiamo" (es. spazio -> %20)
    url = urllib.parse.quote(url, safe=":/?&=%#+,")
    richiesta = urllib.request.Request(url, headers=INTESTAZIONI)
    with urllib.request.urlopen(richiesta, timeout=30) as risposta:
        return risposta.read().decode("utf-8", errors="replace")


def pulisci(testo):
    """Toglie i tag HTML, decodifica i caratteri speciali e gli spazi in più."""
    testo = re.sub(r"<[^>]+>", " ", testo)
    testo = html.unescape(testo)
    return re.sub(r"\s+", " ", testo).strip()


def leggi_date(testo):
    """Da 'dal 01 dicembre 2026 al 02 dicembre 2026' ricava le due date (inizio, fine)."""
    trovate = re.findall(r"(\d{1,2}) (\w+) (\d{4})", testo)
    date_trovate = [date(int(a), MESI[m.lower()], int(g)) for g, m, a in trovate if m.lower() in MESI]
    if not date_trovate:
        return None, None
    return date_trovate[0], date_trovate[-1]


def separa_citta_provincia(testo):
    """Da 'Firenze/Fortezza da Basso (FI)' ricava ('Firenze', 'FI')."""
    m = re.match(r"(.*?)\s*\(([A-Z]{2})\)\s*$", testo)
    if not m:
        return testo.strip() or None, None
    citta = m.group(1).split("/")[0].strip()
    return citta, m.group(2)


# ---------------------------------------------------------------------------
# 1. Lettura del calendario (pagine con l'elenco delle fiere)
# ---------------------------------------------------------------------------

def leggi_pagina_elenco(anno, mese, pagina, tipologia=""):
    """Legge una pagina del calendario e restituisce (lista_fiere, ci_sono_altre_pagine)."""
    parametri = {"fair_year": anno, "month": mese, "page_nr": pagina, "page_size": 20}
    if tipologia:
        parametri["fair_type"] = tipologia
    testo = scarica(URL_CALENDARIO + "?" + urllib.parse.urlencode(parametri))

    fiere = []
    # Ogni fiera è dentro un blocco <div class="fiere--card"> ... </a>
    for blocco in re.findall(r'<div class="fiere--card">(.*?)</a>', testo, re.S):
        link = re.search(r'href="(https://www\.aefi\.it/it/manifestazione/([^"]+))"', blocco)
        nome = re.search(r"<strong>(.*?)</strong>", blocco, re.S)
        periodo = re.search(r'<span class="date">(.*?)</span>', blocco, re.S)
        if not (link and nome and periodo):
            continue

        inizio, fine = leggi_date(pulisci(periodo.group(1)))

        # Dopo la data possono esserci due righe: quartiere fieristico e città (PROV)
        resto = blocco[periodo.end():]
        righe = [pulisci(r) for r in re.split(r"<br\s*/?>", resto)]
        righe = [r for r in righe if r]
        quartiere = righe[0] if len(righe) >= 2 else None
        citta, provincia = separa_citta_provincia(righe[1]) if len(righe) >= 2 else (None, None)

        fiere.append({
            "id": link.group(2),
            "nome": pulisci(nome.group(1)),
            "inizio": inizio,
            "fine": fine,
            "quartiere": quartiere,
            "citta": citta,
            "provincia": provincia,
            "fonte": link.group(1),
        })

    altre_pagine = f"page_nr={pagina + 1}&" in testo
    return fiere, altre_pagine


def leggi_mese(anno, mese, tipologia=""):
    """Legge tutte le pagine di un mese (eventualmente filtrando per tipologia)."""
    tutte = []
    pagina = 1
    while True:
        fiere, altre_pagine = leggi_pagina_elenco(anno, mese, pagina, tipologia)
        tutte.extend(fiere)
        if not altre_pagine or not fiere:
            return tutte
        pagina += 1


# ---------------------------------------------------------------------------
# 2. Lettura della scheda di ogni fiera (settore, luogo preciso, sito web)
# ---------------------------------------------------------------------------

def leggi_scheda(url):
    """Apre la scheda di una fiera e ricava settore, sito web, posizione,
    descrizione, sito ufficiale della fiera e dati dell'organizzatore."""
    testo = scarica(url)
    scheda = {"settore": None, "sito": None, "lat": None, "lng": None,
              "citta": None, "provincia": None, "regione": None, "quartiere": None,
              "citta_organizzatore": None,
              "descrizione": None, "sito_fiera": None, "organizzatore": None}

    # Il settore è il testo in grassetto subito sotto il titolo <h5>
    m = re.search(r"<h5>.*?</h5>\s*<strong>(.*?)</strong>", testo, re.S)
    if m:
        scheda["settore"] = pulisci(m.group(1))

    # La "Descrizione": una frase sulla fiera e, spesso, il link al suo sito ufficiale
    m = re.search(r'<span class="title">Descrizione</span>(.*?)</div>', testo, re.S)
    if m:
        blocco = m.group(1)
        link = re.search(r'href="(https?://[^"]+)"', blocco)
        if link:
            scheda["sito_fiera"] = link.group(1).strip()
        # Il testo, senza gli indirizzi web (che mostriamo a parte come link)
        descrizione = re.sub(r"(https?://|www\.)\S+", "", pulisci(blocco)).strip(" -–·")
        scheda["descrizione"] = descrizione or None

    # L'organizzatore: nome, indirizzo, città, telefono, email, sito
    m = re.search(r'<span class="title">organizzatore</span>(.*?)</li>', testo, re.S)
    if m:
        blocco = m.group(1)
        organizzatore = {}
        indirizzo = re.search(r'<address class="main-address">(.*?)</address>', blocco, re.S)
        if indirizzo:
            righe = [r for r in (pulisci(r) for r in re.split(r"<br\s*/?>", indirizzo.group(1))) if r]
            if righe:
                organizzatore["nome"] = righe[0]
            if len(righe) >= 2:
                organizzatore["indirizzo"] = ", ".join(righe[1:])
        for chiave, etichetta in (("telefono", "Tel"), ("email", "Email")):
            valore = re.search(rf"<strong>{etichetta}:</strong>(.*?)<br", blocco, re.S)
            if valore and pulisci(valore.group(1)):
                organizzatore[chiave] = pulisci(valore.group(1))
        sito = re.search(r'Sito web:</strong>\s*<a[^>]*href="([^"]+)"', blocco)
        if sito:
            organizzatore["sito"] = sito.group(1).strip()
        scheda["organizzatore"] = organizzatore or None

    # Il sito web dell'organizzatore (il primo "Sito web" della pagina)
    m = re.search(r"Sito web:</strong>\s*<a[^>]*href=\"([^\"]+)\"", testo)
    if m:
        scheda["sito"] = m.group(1).strip()

    # Se la fiera si tiene in un quartiere fieristico, la pagina contiene i suoi
    # dati (con coordinate GPS!) in una riga "var expoCenter = {...}"
    m = re.search(r"var expoCenter = (\{.*?\})\s*\n", testo)
    if m:
        try:
            centro = json.loads(m.group(1))
            scheda.update({
                "lat": centro.get("latitude"),
                "lng": centro.get("longitude"),
                "citta": centro.get("municipality"),
                "provincia": centro.get("province"),
                "regione": centro.get("region"),
                "quartiere": centro.get("name"),
            })
        except json.JSONDecodeError:
            pass

    # Altrimenti ci teniamo la città dell'organizzatore (ultima riga dell'indirizzo)
    m = re.search(r'<address class="main-address">(.*?)</address>', testo, re.S)
    if m:
        righe = [pulisci(r) for r in re.split(r"<br\s*/?>", m.group(1))]
        righe = [r for r in righe if r]
        if righe:
            scheda["citta_organizzatore"] = righe[-1]

    return scheda


def leggi_presentazione_sito(url):
    """Apre la pagina principale del sito ufficiale di una fiera e prende la frase
    con cui gli organizzatori la presentano (il "meta description" della pagina,
    lo stesso testo che compare sotto il titolo nei risultati di Google).
    Se il sito non risponde o non ha una presentazione, restituisce None."""
    richiesta = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatibile; MappaFiereItalia/1.0)",
        "Accept-Language": "it-IT,it;q=0.9",
    })
    try:
        with urllib.request.urlopen(richiesta, timeout=12) as risposta:
            codifica = risposta.headers.get_content_charset() or "utf-8"
            testo = risposta.read(400_000).decode(codifica, errors="replace")
    except Exception:
        return None

    # Cerchiamo <meta name="description" content="..."> oppure <meta property="og:description" ...>
    for nome in ("description", "og:description"):
        for meta in re.findall(r"<meta\b[^>]*>", testo, re.I):
            if re.search(rf'(name|property)\s*=\s*["\']{nome}["\']', meta, re.I):
                contenuto = re.search(r'content\s*=\s*"([^"]*)"|content\s*=\s*\'([^\']*)\'', meta, re.I)
                if contenuto:
                    frase = pulisci(contenuto.group(1) or contenuto.group(2) or "")
                    if len(frase) >= 40:          # frasi troppo corte di solito non dicono nulla
                        return frase[:500]
    return None


# ---------------------------------------------------------------------------
# 3. Coordinate di una città (quando AEFI non le fornisce)
# ---------------------------------------------------------------------------

def trova_coordinate(citta, provincia, cache_luoghi):
    """Chiede a OpenStreetMap (servizio Nominatim) le coordinate di una città italiana."""
    chiave = f"{citta}|{provincia or ''}"
    if chiave in cache_luoghi:
        return cache_luoghi[chiave]

    ricerca = f"{citta}, {provincia}, Italia" if provincia else f"{citta}, Italia"
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": ricerca, "format": "json", "limit": 1, "countrycodes": "it", "addressdetails": 1})
    time.sleep(1.1)  # Nominatim chiede al massimo una richiesta al secondo
    try:
        risultati = json.loads(scarica(url))
    except Exception as errore:
        print(f"   ! coordinate non trovate per {ricerca}: {errore}")
        return None
    luogo = None
    if risultati:
        r = risultati[0]
        luogo = {"lat": float(r["lat"]), "lng": float(r["lon"]),
                 "regione": r.get("address", {}).get("state")}
    cache_luoghi[chiave] = luogo
    return luogo


def trova_provincia(lat, lng, cache_luoghi):
    """Chiede a OpenStreetMap in che provincia si trova un punto e restituisce
    la sigla (es. "TO"). Il risultato viene ricordato nella cache."""
    chiave = f"provincia|{lat:.4f}|{lng:.4f}"
    if chiave in cache_luoghi:
        return cache_luoghi[chiave]
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {"lat": lat, "lon": lng, "format": "json", "zoom": 10, "addressdetails": 1})
    time.sleep(1.1)  # Nominatim chiede al massimo una richiesta al secondo
    try:
        indirizzo = json.loads(scarica(url)).get("address", {})
    except Exception as errore:
        print(f"   ! provincia non trovata per {lat},{lng}: {errore}")
        return None
    # Il codice della provincia è scritto come "IT-TO" (livello 6 = provincia)
    codice = indirizzo.get("ISO3166-2-lvl6", "")
    sigla = codice[3:] if codice.startswith("IT-") and len(codice) == 5 else None
    cache_luoghi[chiave] = sigla
    return sigla


# ---------------------------------------------------------------------------
# 4. Pallini sulla costa: se un punto cade in mare (fuori dal disegno della
#    regione), lo spostiamo appena dentro la terraferma disegnata
# ---------------------------------------------------------------------------

def punto_dentro(x, y, anello):
    """Vero se il punto (x=lng, y=lat) è dentro il poligono "anello"."""
    dentro = False
    for i in range(len(anello)):
        x1, y1 = anello[i]
        x2, y2 = anello[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            dentro = not dentro
    return dentro


def carica_regioni():
    """Legge i confini delle regioni: {nome regione: [lista di anelli esterni]}."""
    if not FILE_REGIONI.exists():
        return {}
    dati = json.loads(FILE_REGIONI.read_text(encoding="utf-8"))
    regioni = {}
    for r in dati["features"]:
        geometria = r["geometry"]
        poligoni = geometria["coordinates"] if geometria["type"] == "MultiPolygon" else [geometria["coordinates"]]
        regioni[r["properties"]["nome"]] = [p[0] for p in poligoni]
    return regioni


def porta_sulla_terra(lat, lng, anelli):
    """Se il punto è fuori dalla regione, lo sposta sul punto di confine più vicino
    e poi un poco verso l'interno, finché cade dentro. Altrimenti lo lascia com'è."""
    if any(punto_dentro(lng, lat, a) for a in anelli):
        return lat, lng
    # Il punto più vicino sul bordo (controlliamo ogni lato del poligono)
    migliore, distanza_minima = None, None
    for anello in anelli:
        for i in range(len(anello)):
            (x1, y1), (x2, y2) = anello[i - 1], anello[i]
            dx, dy = x2 - x1, y2 - y1
            lunghezza = dx * dx + dy * dy
            t = 0 if lunghezza == 0 else max(0, min(1, ((lng - x1) * dx + (lat - y1) * dy) / lunghezza))
            px, py = x1 + t * dx, y1 + t * dy
            d = (px - lng) ** 2 + (py - lat) ** 2
            if distanza_minima is None or d < distanza_minima:
                migliore, distanza_minima = (px, py), d
    if migliore is None:
        return lat, lng
    # Ci spostiamo oltre il bordo, nella stessa direzione, a passi di circa 300 metri
    px, py = migliore
    dx, dy = px - lng, py - lat
    lunghezza = (dx * dx + dy * dy) ** 0.5 or 1
    for passi in range(1, 30):
        nx, ny = px + dx / lunghezza * 0.003 * passi, py + dy / lunghezza * 0.003 * passi
        if any(punto_dentro(nx, ny, a) for a in anelli):
            return round(ny, 5), round(nx, 5)
    return lat, lng


def normalizza_citta(citta):
    """Scrive i nomi delle città sempre allo stesso modo: 'AOSTA' -> 'Aosta',
    'Città di Saluzzo' -> 'Saluzzo', 'Firenze/Fortezza da Basso' -> 'Firenze'."""
    if not citta:
        return None
    citta = citta.split("/")[0].strip()
    citta = re.sub(r"^(Città|Comune) di\s+", "", citta, flags=re.I)
    # Solo se è tutto maiuscolo o tutto minuscolo sistemiamo le maiuscole
    if citta.isupper() or citta.islower():
        citta = citta.title().replace("'S", "'s")
    return citta


def normalizza_regione(regione, provincia):
    """Restituisce il nome della regione scritto sempre allo stesso modo."""
    if provincia and provincia.upper() in PROVINCE_REGIONI:
        return PROVINCE_REGIONI[provincia.upper()]
    if not regione:
        return None
    # Nomi come "Trentino-Alto Adige/Südtirol" -> confronto con le regioni conosciute
    for nome in set(PROVINCE_REGIONI.values()):
        if nome.lower().split("-")[0].split(" ")[0] in regione.lower():
            return nome
    return regione


# ---------------------------------------------------------------------------
# Programma principale
# ---------------------------------------------------------------------------

def main():
    oggi = date.today()

    # La cache ricorda le schede già lette, così gli aggiornamenti successivi sono veloci
    cache = {"schede": {}, "luoghi": {}, "siti": {}}
    if FILE_CACHE.exists():
        cache = json.loads(FILE_CACHE.read_text(encoding="utf-8"))
    cache.setdefault("siti", {})

    # Riassunti scritti a mano e confini delle regioni
    riassunti = {}
    if FILE_RIASSUNTI.exists():
        riassunti = json.loads(FILE_RIASSUNTI.read_text(encoding="utf-8"))
    regioni_disegnate = carica_regioni()

    # --- Passo 1: elenco delle fiere, mese per mese ---------------------------
    fiere = {}
    ultimo_giorno = oggi + timedelta(days=GIORNI_DA_RACCOGLIERE)

    # I mesi da leggere: dal mese di oggi fino al mese dell'ultimo giorno
    mesi_da_leggere = []
    anno, mese = oggi.year, oggi.month
    while (anno, mese) <= (ultimo_giorno.year, ultimo_giorno.month):
        mesi_da_leggere.append((anno, mese))
        anno, mese = (anno + 1, 1) if mese == 12 else (anno, mese + 1)

    for anno, mese in mesi_da_leggere:
        print(f"Leggo il calendario di {mese:02d}/{anno}...")
        for f in leggi_mese(anno, mese):
            fiere.setdefault(f["id"], f)
        # Ripetiamo la lettura filtrando per tipologia, per sapere di che tipo è ogni fiera
        for codice, etichetta in TIPOLOGIE.items():
            for f in leggi_mese(anno, mese, codice):
                if f["id"] in fiere:
                    fiere[f["id"]]["tipologia"] = etichetta
        for f in leggi_mese(anno, mese, "ABROAD"):
            if f["id"] in fiere:
                fiere[f["id"]]["estera"] = True

    print(f"Trovate {len(fiere)} fiere nel calendario.")

    # --- Passo 2 e 3: dettagli e coordinate ----------------------------------
    risultato = []
    for numero, f in enumerate(sorted(fiere.values(), key=lambda x: x["inizio"] or oggi), 1):
        # Date corrette a mano per questa edizione (vedi "date" in CORREZIONI_FIERE)
        if f["inizio"]:
            date_giuste = CORREZIONI_FIERE.get(chiave_fiera(f["nome"]), {}).get("date", {}).get(str(f["inizio"].year))
            if date_giuste:
                f["inizio"], f["fine"] = (date.fromisoformat(d) for d in date_giuste)

        # Teniamo solo fiere in Italia, con date valide, non ancora finite
        # e che iniziano entro il periodo da raccogliere
        if f.get("estera") or not f["fine"] or f["fine"] < oggi or f["inizio"] > ultimo_giorno:
            continue

        # Rileggiamo la scheda se non l'abbiamo ancora, oppure se è stata salvata
        # da una versione vecchia del programma (senza i dati dell'organizzatore)
        if f["id"] not in cache["schede"] or "organizzatore" not in cache["schede"][f["id"]]:
            print(f"[{numero}/{len(fiere)}] Leggo la scheda di {f['nome']}")
            try:
                cache["schede"][f["id"]] = leggi_scheda(f["fonte"])
            except Exception as errore:
                print(f"   ! errore nella scheda: {errore}")
                continue
        scheda = cache["schede"][f["id"]]

        # Eventuali correzioni a mano per questa fiera (vedi CORREZIONI_FIERE)
        correzione = CORREZIONI_FIERE.get(chiave_fiera(f["nome"]), {})

        citta = correzione.get("citta") or scheda["citta"] or f["citta"]
        provincia = correzione.get("provincia") or scheda["provincia"] or f["provincia"]
        lat, lng, regione = scheda["lat"], scheda["lng"], scheda["regione"]
        if scheda["quartiere"] in CORREZIONI_QUARTIERI:
            lat, lng = CORREZIONI_QUARTIERI[scheda["quartiere"]]
        if "lat" in correzione:
            lat, lng = correzione["lat"], correzione["lng"]

        # Se mancano le coordinate, le cerchiamo partendo dalla città
        if lat is None:
            if not citta and scheda["citta_organizzatore"]:
                citta, provincia = separa_citta_provincia(scheda["citta_organizzatore"])
            if citta:
                luogo = trova_coordinate(citta, provincia, cache["luoghi"])
                if luogo:
                    lat, lng = luogo["lat"], luogo["lng"]
                    regione = regione or luogo["regione"]

        # La presentazione scritta sul sito ufficiale della fiera
        # (la rileggiamo al massimo una volta ogni 30 giorni)
        presentazione = None
        sito_fiera = correzione.get("sito_fiera") or scheda.get("sito_fiera")
        # A volte AEFI scrive un link guasto tipo "https://admin.aefi.it/admin/fair/www.gardacon.it":
        # teniamo solo l'indirizzo vero in fondo
        if sito_fiera and "admin.aefi.it/" in sito_fiera:
            sito_fiera = "https://" + sito_fiera.rstrip("/").split("/")[-1]
        if sito_fiera:
            memoria = cache["siti"].get(sito_fiera)
            if not memoria or (oggi - date.fromisoformat(memoria["letto"])).days > 30:
                print(f"   leggo la presentazione dal sito {sito_fiera}")
                memoria = {"testo": leggi_presentazione_sito(sito_fiera), "letto": oggi.isoformat()}
                cache["siti"][sito_fiera] = memoria
            presentazione = memoria["testo"]

        # Organizzatore e suo sito, con le eventuali correzioni a mano
        organizzatore = dict(scheda.get("organizzatore") or {})
        if correzione.get("organizzatore"):
            organizzatore["nome"] = correzione["organizzatore"]
        sito_organizzatore = correzione.get("sito") or sito_valido(scheda["sito"])
        organizzatore.pop("sito", None)
        if sito_organizzatore:
            organizzatore["sito"] = sito_organizzatore

        # Sigla della provincia mancante (o scritta per esteso, es. "Vicenza" invece di "VI"):
        # la ricaviamo dalla posizione sulla mappa
        if provincia and not re.fullmatch(r"[A-Z]{2}", provincia.strip().upper()):
            provincia = None
        if provincia:
            provincia = provincia.strip().upper()
            # Sigle sbagliate usate da AEFI (es. "CG" per Cagliari, che è "CA")
            provincia = {"CG": "CA"}.get(provincia, provincia)
        if not provincia and lat is not None:
            provincia = trova_provincia(lat, lng, cache["luoghi"])

        # Pallino in mare? Lo portiamo appena dentro la regione disegnata sulla cartina
        nome_regione = normalizza_regione(regione, provincia)
        if lat is not None and nome_regione in regioni_disegnate:
            lat, lng = porta_sulla_terra(lat, lng, regioni_disegnate[nome_regione])

        # Il riassunto scritto a mano: prima cerchiamo "nome (città)", poi solo "nome"
        citta_giusta = normalizza_citta(citta)
        riassunto = (riassunti.get(f"{chiave_fiera(f['nome'])} ({(citta_giusta or '').lower()})")
                     or riassunti.get(chiave_fiera(f["nome"])) or {})

        risultato.append({
            "id": f["id"],
            "nome": f["nome"],
            "inizio": f["inizio"].isoformat(),
            "fine": f["fine"].isoformat(),
            "settore": correzione.get("settore") or scheda["settore"],
            "tipologia": f.get("tipologia"),
            "quartiere": scheda["quartiere"] or f["quartiere"],
            "citta": citta_giusta,
            "provincia": provincia,
            "regione": nome_regione,
            "lat": lat,
            "lng": lng,
            "sito": sito_organizzatore,
            "fonte": f["fonte"],
            # Per la finestrella "Info fiera". NON pubblichiamo i testi di AEFI e dei siti
            # delle fiere (sono protetti da diritto d'autore): solo i nostri riassunti.
            "sito_fiera": sito_fiera,
            "riassunto": riassunto.get("testo"),
            "fonte_riassunto": riassunto.get("fonte"),
            "organizzatore": organizzatore or None,
        })

        # Salviamo la cache ogni tanto, così se il programma si interrompe non si perde il lavoro
        if numero % 25 == 0:
            FILE_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1, default=str), encoding="utf-8")

    # --- Passo 4: salvataggio -------------------------------------------------
    FILE_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1, default=str), encoding="utf-8")

    # Protezione: l'aggiornamento ora gira da solo ogni giorno. Se AEFI non risponde
    # o cambia il suo sito, potremmo trovare poche fiere (o nessuna): in quel caso
    # NON sovrascriviamo l'elenco buono di ieri e ci fermiamo con un errore,
    # così GitHub ce lo segnala e la mappa resta piena.
    if FILE_FIERE.exists():
        fiere_di_prima = len(json.loads(FILE_FIERE.read_text(encoding="utf-8")).get("fiere", []))
        if len(risultato) < max(20, fiere_di_prima // 2):
            print(f"STOP: trovate solo {len(risultato)} fiere (prima erano {fiere_di_prima}). "
                  "Lascio l'elenco di prima: controllare il sito AEFI.")
            sys.exit(1)

    FILE_FIERE.parent.mkdir(parents=True, exist_ok=True)
    FILE_FIERE.write_text(json.dumps({
        "aggiornato": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fonte": "AEFI - Associazione Esposizioni e Fiere Italiane (www.aefi.it)",
        "fiere": risultato,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    senza_posizione = sum(1 for f in risultato if f["lat"] is None)
    print(f"Fatto! Salvate {len(risultato)} fiere in {FILE_FIERE}")
    print(f"({senza_posizione} senza posizione sulla mappa: compariranno solo nell'elenco)")

    # Promemoria: fiere per cui non conosciamo nessun sito. Il sito mostrerà comunque
    # un link di ricerca, ma è meglio aggiungerle a CORREZIONI_FIERE dopo averle verificate.
    senza_sito = [f["nome"] for f in risultato if not f["sito"] and not f["sito_fiera"]]
    if senza_sito:
        print(f"\nATTENZIONE: {len(senza_sito)} fiere senza nessun sito (da aggiungere a CORREZIONI_FIERE):")
        for nome in senza_sito:
            print(f"   - {nome}")

    # Promemoria: fiere nuove senza il nostro riassunto. Per scriverlo si possono usare
    # come traccia (riscrivendoli con parole proprie!) la descrizione AEFI e la presentazione
    # del sito, che restano salvate in strumenti/cache_schede.json.
    senza_riassunto = sorted({f["nome"] for f in risultato if not f["riassunto"]})
    if senza_riassunto:
        print(f"\nATTENZIONE: {len(senza_riassunto)} fiere senza riassunto (da aggiungere a data/riassunti.json):")
        for nome in senza_riassunto:
            print(f"   - {nome}")


if __name__ == "__main__":
    main()
