"""
crea_icone.py
=============
Disegna le icone dell'app "Fiere in Italia" (quelle che compaiono sulla schermata
Home del telefono quando si installa il sito come app).

Disegno: quadrato blu (il colore principale del sito) con un segnaposto bianco
della mappa e, sotto, una piccola striscia col tricolore italiano.
Niente loghi di altri: è un disegno nostro, fatto solo con forme semplici.

Si usa così (serve la libreria Pillow: python -m pip install pillow):
    python strumenti/crea_icone.py
Crea i file nella cartella "icone/".
"""

from pathlib import Path
from PIL import Image, ImageDraw

CARTELLA = Path(__file__).resolve().parent.parent / "icone"
BLU_CHIARO = (59, 130, 246)    # parte alta dello sfondo
BLU_SCURO = (29, 78, 216)      # parte bassa dello sfondo
VERDE, BIANCO, ROSSO = (0, 146, 70), (255, 255, 255), (206, 43, 55)


def disegna(lato, angoli_tondi):
    """Disegna l'icona grande 4 volte e poi la rimpicciolisce: così i bordi vengono lisci."""
    S = lato * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Sfondo: sfumatura dal blu chiaro (in alto) al blu scuro (in basso)
    sfondo = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(sfondo)
    for y in range(S):
        t = y / (S - 1)
        colore = tuple(round(a + (b - a) * t) for a, b in zip(BLU_CHIARO, BLU_SCURO))
        d.line([(0, y), (S, y)], fill=colore)

    # Forma dello sfondo: quadrato con angoli tondi (icona normale)
    # oppure quadrato pieno (icona "maskable": il telefono ritaglia da solo la forma)
    maschera = Image.new("L", (S, S), 0)
    raggio = int(S * 0.22) if angoli_tondi else 0
    ImageDraw.Draw(maschera).rounded_rectangle([0, 0, S - 1, S - 1], radius=raggio, fill=255)
    img.paste(sfondo, (0, 0), maschera)

    d = ImageDraw.Draw(img)
    # Tutto il disegno sta nel cerchio centrale (80% del lato), che il telefono non taglia mai
    cx = S / 2
    # Segnaposto: un cerchio con sotto una punta (triangolo)
    r = S * 0.19                 # raggio della testa del segnaposto
    cy = S * 0.40                # centro della testa
    punta_y = S * 0.70           # dove finisce la punta
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BIANCO)
    d.polygon([(cx - r * 0.86, cy + r * 0.5), (cx + r * 0.86, cy + r * 0.5), (cx, punta_y)], fill=BIANCO)
    # Buco al centro della testa, del colore dello sfondo
    rb = r * 0.42
    colore_buco = tuple(round(a + (b - a) * (cy / S)) for a, b in zip(BLU_CHIARO, BLU_SCURO))
    d.ellipse([cx - rb, cy - rb, cx + rb, cy + rb], fill=colore_buco)

    # Striscia tricolore sotto il segnaposto
    larg, alt = S * 0.36, S * 0.06
    x0, y0 = cx - larg / 2, S * 0.76
    terzo = larg / 3
    for i, colore in enumerate((VERDE, BIANCO, ROSSO)):
        d.rectangle([x0 + i * terzo, y0, x0 + (i + 1) * terzo, y0 + alt], fill=colore)

    return img.resize((lato, lato), Image.LANCZOS)


if __name__ == "__main__":
    CARTELLA.mkdir(exist_ok=True)
    disegna(192, True).save(CARTELLA / "icona-192.png")
    disegna(512, True).save(CARTELLA / "icona-512.png")
    disegna(512, False).save(CARTELLA / "icona-maskable-512.png")
    # iPhone: vuole un'icona quadrata piena da 180 px (gli angoli li arrotonda lui)
    disegna(180, False).convert("RGB").save(CARTELLA / "apple-touch-icon.png")
    disegna(48, True).save(CARTELLA / "favicon-48.png")
    print("Icone create in", CARTELLA)
