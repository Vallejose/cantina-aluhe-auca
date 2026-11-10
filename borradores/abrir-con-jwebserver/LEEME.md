# Abrir la app con jwebserver (reemplazado)

`abrir-cantina.bat` abría la app en la PC con `jwebserver`, el servidor web que viene con Java.
Solo servía los archivos: **no imprime** y no se puede usar desde las tablets con impresión.

Lo reemplazó **`iniciar-cantina.bat`** (etapa 4), que arranca `servidor/Cantina.java`: sirve la app
en el mismo puerto (8080) y además manda los tickets y las comandas a la impresora.

Se guarda por si hace falta abrir la app sin el servidor de impresión.
Para usarlo, copialo a la carpeta principal de la app.
