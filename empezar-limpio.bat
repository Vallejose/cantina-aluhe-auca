@echo off
rem Antes del evento: aparta las ventas de prueba que quedaron guardadas en esta laptop.
rem No borra nada: las mueve a servidor\apartado-FECHA. Cerrar antes la ventana del servidor.
cd /d "%~dp0"
title Empezar limpio
where java >nul 2>&1 || (echo No se encontro Java. & pause & exit /b 1)
java servidor\Cantina.java --empezar-limpio
echo.
pause
