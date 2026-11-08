@echo off
rem Abre la app de la cantina en esta PC, mientras no esta publicada en internet.
rem Usa el servidor web que viene con Java (jwebserver, Java 18 o superior).
rem Para cerrarla: cerrar la ventana "Servidor Cantina".
cd /d "%~dp0"
where jwebserver >nul 2>&1 || (echo No se encontro jwebserver: hace falta Java 18 o superior en el PATH. & pause & exit /b 1)
start "Servidor Cantina" jwebserver -p 8080
timeout /t 2 /nobreak >nul
start "" http://localhost:8080/
