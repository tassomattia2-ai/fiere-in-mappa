"""
server_locale.py
================
Un piccolo server per vedere il sito sul proprio computer (http://localhost:8000).

È come "python -m http.server", con una differenza importante: dice al browser
di NON tenere copie vecchie delle pagine (la "cache"). Così ogni volta che
ricarichi la pagina vedi subito l'ultima versione dei file.

Si avvia con un doppio clic su avvia-sito.bat, oppure:
    python strumenti/server_locale.py          (porta 8000)
    python strumenti/server_locale.py 8765     (un'altra porta)
"""

import http.server
import os
import socket
import sys
from pathlib import Path

PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
CARTELLA_PROGETTO = Path(__file__).resolve().parent.parent


# Il server è raggiungibile anche dagli altri dispositivi dello stesso Wi-Fi (telefoni, tablet).
# Per sicurezza mostra SOLO i file del sito: niente appunti, email, programmi, catture, copie.
ESTENSIONI_DEL_SITO = {".html", ".css", ".js", ".json", ".geojson", ".png", ".jpg", ".jpeg",
                       ".svg", ".ico", ".webp", ".woff", ".woff2"}
CARTELLE_PRIVATE = ("strumenti/", "catture/", ".")


class ServerSenzaCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # "no-store" = il browser non deve conservare nessuna copia
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def permesso(self):
        """True se l'indirizzo chiesto è un file del sito che si può mostrare."""
        percorso = self.path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        if percorso == "" or percorso.endswith("/"):
            return True                                   # la pagina principale (index.html)
        if percorso.startswith(CARTELLE_PRIVATE) or "/." in percorso or ".." in percorso:
            return False
        return Path(percorso).suffix.lower() in ESTENSIONI_DEL_SITO

    def do_GET(self):
        if not self.permesso():
            self.send_error(404, "File non disponibile")
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.permesso():
            self.send_error(404, "File non disponibile")
            return
        super().do_HEAD()

    def list_directory(self, path):
        # Mai mostrare l'elenco dei file di una cartella
        self.send_error(404, "File non disponibile")
        return None


def indirizzo_wifi():
    """L'indirizzo di questo computer nella rete di casa (es. 192.168.0.49).
    Il "collegamento" UDP non spedisce nulla: serve solo a sapere quale scheda di rete si usa."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.168.0.1", 9))
            return s.getsockname()[0]
    except OSError:
        return None


class ServerDoppioIndirizzo(http.server.ThreadingHTTPServer):
    """Risponde sia su IPv6 (::1) sia su IPv4 (127.0.0.1):
    "localhost" a volte vuol dire l'uno, a volte l'altro, a seconda del browser."""
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    os.chdir(CARTELLA_PROGETTO)   # serviamo i file della cartella del progetto
    with ServerDoppioIndirizzo(("::", PORTA), ServerSenzaCache) as server:
        print(f"Server acceso su http://localhost:{PORTA}  (chiudi la finestra per spegnerlo)")
        wifi = indirizzo_wifi()
        if wifi:
            print(f"Dagli altri dispositivi dello STESSO Wi-Fi: http://{wifi}:{PORTA}/")
            print("Attenzione: non tenerlo acceso su reti Wi-Fi pubbliche (bar, stazioni, hotel).")
        server.serve_forever()
