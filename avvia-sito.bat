@echo off
rem ============================================================
rem  Avvia il sito della Mappa delle Fiere sul tuo computer.
rem  Basta un doppio clic su questo file:
rem    1. accende un piccolo server nella cartella del progetto
rem    2. apre la pagina http://localhost:8000 nel browser
rem  Per spegnere il server chiudi questa finestra nera.
rem ============================================================

rem Ci spostiamo nella cartella dove si trova questo file
cd /d "%~dp0"

echo.
echo   Mappa delle Fiere - server acceso
echo   Indirizzo: http://localhost:8000
echo   (l'indirizzo per i telefoni sullo stesso Wi-Fi compare qui sotto)
echo.
echo   NON chiudere questa finestra mentre guardi il sito.
echo   Quando hai finito, chiudila per spegnere il server.
echo.

rem Apriamo il browser (dopo un paio di secondi, il tempo che il server parta)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8000"

rem Accendiamo il server (resta acceso finche' la finestra e' aperta).
rem Usiamo il nostro server, che impedisce al browser di mostrare versioni vecchie.
python strumenti\server_locale.py
