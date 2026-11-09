# Cantina Aluhe Auca — guía para agentes

Este archivo es para cualquier agente (Claude u otro) que trabaje en este repositorio.
Leelo completo antes de cambiar algo.

## Qué es

App para la cantina del Grupo Scout **Aluhe Auca**: tomar pedidos, cobrar, imprimir el
ticket y la comanda (mismo número), y al final saber **cuánta plata se recaudó y cuánta
comida se vendió**. Evento chico, probablemente de un solo uso. Una laptop y una o dos
tablets Android (puede sumarse una durante el evento). Una sola impresora térmica por red.

La usan **personas jóvenes que no conocen el proyecto**: textos cortos, botones grandes,
nada técnico en pantalla.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| **Estado del proyecto y qué falta, en orden** | [`docs/plan.md`](docs/plan.md) ← empezar acá |
| Qué hace el programa, decisiones, numeración, datos, exportaciones | [`docs/esquema.md`](docs/esquema.md) |
| Capturas de todas las pantallas | [`docs/capturas/`](docs/capturas/) |
| Cómo usarla, archivos que genera, estructura del código | [`README.md`](README.md) |
| Versiones guardadas que la app **no usa** | [`borradores/`](borradores/) |
| Diseño visual (lienzo con el esquema y las vistas) | Artifact privado del dueño: https://claude.ai/artifact/2NC1jHyLS8XCNwqAJ9TzzZ |

**Mantené `docs/plan.md` al día**: cuando termines algo o se tome una decisión, actualizalo
en el mismo commit.

## Cómo trabaja el dueño (importante)

- **Primero se charla y se diseña, después se programa.** Si pide "solo charlemos" o
  "no generes código", no toques el código. Los bloques nuevos (por ejemplo, impresión) se
  definen primero y se muestran como vista en el lienzo; se programan cuando el dueño lo dice.
- Prefiere **poco texto y más visual**.
- Habla español rioplatense (Uruguay). Todo lo que ve el usuario va en ese español: "vos",
  "tocá", "elegí".
- Cuando algo se descarta pero puede servir, **no se borra**: va a `borradores/` con un `LEEME.md`.

## Decisiones tomadas (no cambiarlas sin preguntar)

- **PWA en HTML, CSS y JavaScript simples, sin herramientas de compilación** (sin npm,
  sin frameworks). Scripts clásicos cargados en orden desde `index.html`, un objeto global
  por módulo (`Util`, `DB`, `Datos`, `Documentos`, `Exportaciones`, `XLSX`, `Pantalla*`).
- **Cada dispositivo es una "caja"** (nunca decir "equipo" en pantalla). Cajas **1 a 7 de
  venta**, **8 y 9 de prueba** (franja "MODO PRUEBA", se pueden resetear).
- **Numeración:** caja × 1000 + correlativo (la caja 2 usa 2000–2999). No se reinicia.
- **Datos guardados en cada caja** (IndexedDB), nunca se borran en las cajas de venta.
- **Montos en centésimos y enteros** (`12050` = $ 120,50). Formatear solo al mostrar (`Util.dinero`).
- Cada venta guarda **una copia** del nombre, precio y costo del artículo en ese momento.
- Un solo medio de pago por pedido. "Sin cargo" es un medio de pago: cuenta productos y costo, no dinero.
- Anular = pedido entero, queda visible y no suma. Comanda única, sin sectores ni estados.
- **Costo y ganancia no salen en las planillas exportadas** (solo en el JSON para consolidar).
- Menú: Vender, Pedidos, Movimientos, Cierre; y el desplegable "Ajustes" (Artículos,
  Medios de pago, Configuración).
- Colores del grupo: azul marino `#1e3a5f` y amarillo `#f2b134` (variables en `css/estilos.css`).
- Pantallas: notebook y tablet **en horizontal**.

## Etapa en curso: impresión por red (etapa 4)

- La **laptop hace de servidor** con un programa chico en **Java** (el dueño tiene Java 21):
  sirve la app a las tablets por la red local y reenvía las impresiones a la impresora
  (`IP:9100`, ESC/POS), de a una y en orden. Interruptores centrales en la laptop:
  Tickets Sí/No y Comandas Sí/No.
- **Servidor simple, sin base de datos central.** Las ventas siguen guardadas en cada caja.
  ⚠️ El servidor que además **almacena y centraliza la información de las terminales es otro
  proyecto**: no se implementa en este repositorio.
- GitHub Pages quedó **descartado** para este proyecto (se sirve desde la laptop).
- Ver los pasos y las decisiones pendientes en `docs/plan.md`.

## Cómo probar los cambios

- Servir la carpeta y abrir en Chromium: `python3 -m http.server 8765` (o `jwebserver -p 8080`
  en Windows, que es lo que hace `abrir-cantina.bat`).
- Probar los flujos con Playwright (sin interfaz). Para cargar datos rápido se puede usar la
  consola: `Datos.guardarArticulo(...)`, `Datos.confirmarPedido(...)`.
- Revisar que no haya errores en consola y sacar capturas de lo que cambió.
- Si se toca un número del cierre o de una exportación, **verificarlo con un cálculo hecho
  aparte**, no con la misma lógica de la app.
- Si se agrega o renombra un archivo de la app: sumarlo a `index.html` y a `ARCHIVOS` en
  `sw.js`, y **subir `VERSION`** en `sw.js`.
- Si cambian las pantallas, regenerar las capturas de `docs/capturas/`.

## Repositorio

- Rama `main`. Commits en español, describiendo el cambio para el usuario.
- El dueño también lo tiene clonado en su PC y trae los cambios con GitHub Desktop (Pull).
