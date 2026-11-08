# Cantina Aluhe Auca

App para tomar pedidos, cobrar, generar ticket y comanda, y cerrar la caja.
Es una PWA: funciona en Windows y Android, se instala desde el navegador y
**cada equipo guarda sus propios datos**, sin internet ni servidor.

![Pantalla de venta](docs/capturas/02-vender.png)

- [Esquema del programa](docs/esquema.md): qué hace, decisiones tomadas, numeración y datos.
- [Capturas de todas las pantallas](docs/esquema.md#pantallas)

## Estado

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Base, configuración del equipo, artículos, medios de pago | ✅ Lista |
| 2 | Vender, cobrar, ticket, comanda, pedidos y anulación | ✅ Lista |
| 3 | Caja (fondo y retiros), cierre, exportación y respaldo | ✅ Lista |
| 4 | Prueba instalada en Windows y Android | Pendiente |

## Pendientes para más adelante

- Dónde publicarla (necesita `https` para instalarla en Android; opción: GitHub Pages).
- Impresión de tickets, comandas y comprobantes de retiro.
- Consolidar los cierres exportados de todos los equipos en un documento único.
- Comandas divididas por sector (cocina, barra).
- **Formato de importación de artículos** (por ejemplo desde Excel o CSV).
  Hoy "Importar carta" solo acepta el `.json` que genera "Exportar carta".
- **Otras exportaciones** (a definir cuáles y con qué columnas).

## Probarla en esta PC

Doble clic en **`abrir-cantina.bat`**. Abre el navegador en `http://localhost:8080`.
Para cerrarla, cerrá la ventana "Servidor Cantina".

Usa el servidor web que viene con Java (`jwebserver`, Java 18 o superior).

> Los datos quedan guardados en el navegador **para esa dirección exacta**.
> Abrila siempre en `http://localhost:8080` y con el mismo navegador, o vas a ver la app vacía.

Para instalarla en Android hace falta publicarla en una dirección `https`
(pendiente: GitHub Pages u otra opción).

## Numeración

- Cada equipo elige su número la primera vez que se abre la app.
- **Equipos 1 a 7: venta.** El equipo 2 numera del 2000 al 2999, y así.
  Sus datos nunca se borran.
- **Equipos 8 y 9: prueba.** Muestran una franja amarilla "MODO PRUEBA" y se
  pueden resetear desde Configuración (borra pedidos y caja; mantiene la carta).

## Archivos que genera

| Botón | Archivo | Para qué |
|---|---|---|
| Artículos › Exportar carta | `carta-equipoN-fecha.json` | Pasar la carta a otros equipos |
| Cierre › Exportar cierre para consolidar | `cierre-equipoN-fecha.json` | Juntar después los cierres de todos los equipos |
| Cierre › Exportar a Excel (CSV) | `ventas-equipoN-fecha.csv` | Ventas en Excel, una fila por ticket: pedido, fecha, hora, equipo, medio de pago y venta (sin los anulados) |
| Configuración › Exportar respaldo completo | `respaldo-equipoN-fecha-hora.json` | Recuperar todo si el dispositivo falla |

Los archivos de los equipos de prueba llevan `-PRUEBA` en el nombre.

## Cómo está hecha

HTML, CSS y JavaScript simples, sin herramientas de compilación.

```
index.html               la página
css/estilos.css          colores y diseño
js/util.js               formato de dinero, ventanas, avisos
js/db.js                 almacenamiento del dispositivo (IndexedDB)
js/datos.js              reglas de negocio (validaciones, carta, reseteo)
js/app.js                arranque y menú
js/pantallas/*.js        una pantalla por archivo
js/documentos.js         ticket, comanda y comprobante de retiro
sw.js                    permite abrirla sin internet
docs/                    esquema del programa y capturas
manifest.webmanifest     nombre e ícono al instalarla
```

Los montos se guardan en **centésimos** (enteros): $ 120,50 se guarda como 12050.
