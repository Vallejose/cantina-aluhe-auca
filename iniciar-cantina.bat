@echo off
rem Arranca el servidor de la cantina en esta laptop (Caja 1):
rem sirve la app a las tablets y manda las impresiones a la impresora.
rem Para apagarlo: cerrar esta ventana.
cd /d "%~dp0"
title Servidor Cantina
where java >nul 2>&1 || (echo No se encontro Java. Hace falta Java 21 instalado. & pause & exit /b 1)
java servidor\Cantina.java %*
echo.
echo El servidor se detuvo.
pause
