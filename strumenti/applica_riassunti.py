"""
Inserisce i riassunti di data/riassunti.json dentro data/fiere.json, SENZA rileggere AEFI.

Serve quando si aggiungono riassunti nuovi (a mano o dal "Claude programmato" di ogni giorno):
così il sito li mostra subito, senza aspettare l'aggiornamento delle fiere del giorno dopo.
Usa la stessa regola di aggiorna_fiere.py: prima cerca "nome (città)", poi solo "nome".

Si lancia con:
    python strumenti/applica_riassunti.py

Alla fine elenca le fiere ancora senza riassunto, con il link alla loro scheda AEFI.
"""

import json
import re
from pathlib import Path

CARTELLA_PROGETTO = Path(__file__).resolve().parent.parent
FILE_FIERE = CARTELLA_PROGETTO / "data" / "fiere.json"
FILE_RIASSUNTI = CARTELLA_PROGETTO / "data" / "riassunti.json"


def chiave_fiera(nome):
    """Il nome di una fiera ridotto a "chiave" (uguale ad aggiorna_fiere.py)."""
    return re.sub(r"\s+", " ", nome).strip().lower()


def main():
    dati = json.loads(FILE_FIERE.read_text(encoding="utf-8"))
    riassunti = json.loads(FILE_RIASSUNTI.read_text(encoding="utf-8"))

    aggiunti = 0
    for f in dati["fiere"]:
        chiave = chiave_fiera(f["nome"])
        riassunto = (riassunti.get(f"{chiave} ({(f.get('citta') or '').lower()})")
                     or riassunti.get(chiave) or {})
        if riassunto.get("testo") and riassunto.get("testo") != f.get("riassunto"):
            f["riassunto"] = riassunto["testo"]
            f["fonte_riassunto"] = riassunto.get("fonte")
            aggiunti += 1

    if aggiunti:
        FILE_FIERE.write_text(json.dumps(dati, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Riassunti inseriti o cambiati: {aggiunti}")

    mancanti = sorted({(f["nome"], f.get("citta") or "", f.get("fonte") or "")
                       for f in dati["fiere"] if not f.get("riassunto")})
    print(f"Fiere ancora senza riassunto: {len(mancanti)}")
    for nome, citta, fonte in mancanti:
        print(f"   - {nome} ({citta})  {fonte}")


if __name__ == "__main__":
    main()
