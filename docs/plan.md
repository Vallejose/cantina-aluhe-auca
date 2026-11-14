# Plan de trabajo — Cantina Aluhe Auca

Dónde estamos y qué falta. Se actualiza cada vez que se termina algo o se toma una decisión.

**Uso previsto:** un evento chico, probablemente de un solo uso. Una laptop (Caja 1 y servidor) y una o dos tablets Android, con la posibilidad de sumar una tablet durante el evento. Una sola impresora térmica, conectada por red (Ethernet). Lo usan personas jóvenes que no conocen el proyecto: son usuarios, nada más.

**Objetivo:** tomar pedidos, imprimir el ticket y la comanda, y al final saber cuánta plata se recaudó y cuánta comida se vendió.

---

## ✅ Hecho

| | Qué |
|---|---|
| ✅ | **Etapa 1:** base de la app, configuración de la caja, artículos (nombre, categoría y precio obligatorios; costo opcional), medios de pago |
| ✅ | **Etapa 2:** vender, cobrar (vuelto en efectivo), ticket y comanda con el mismo número, pedidos y anulación |
| ✅ | **Etapa 3:** movimientos (fondo de caja, retiros con comprobante), cierre (ventas, costo, ganancia, arqueo), respaldo y restauración |
| ✅ | **Exportaciones simplificadas:** Excel con 3 pestañas, 5 CSV y 2 JSON, sin filtros. La versión con filtros está guardada en `borradores/` |
| ✅ | Cajas 1 a 7 de venta y 8 y 9 de prueba (con reseteo); "Caja" en lugar de "Equipo"; pantalla "Movimientos" |
| ✅ | Menú con desplegable "Ajustes"; colores del grupo (azul marino y amarillo) |
| ✅ | Repositorio en GitHub con documentación y capturas |
| ✅ | **Etapa 4 (código):** servidor en la laptop, impresión al cobrar, reintentar, reimprimir, pantalla Impresión e indicador. Probado con la impresora real desde la laptop; falta probar desde una tablet Android |

---

## 🔜 Lo que falta, en orden

### Etapa 4 · Impresión por red, con la laptop como servidor

| # | Paso | Estado |
|---|---|---|
| 4.1 | **Datos de la impresora:** marca, modelo y ancho del papel (58 u 80 mm) | 🟡 Papel de **80 mm**. Falta marca y modelo (se asume ESC/POS genérico) |
| 4.2 | **Prueba con la impresora real:** IP fija en el router; *Ajustes › Impresión › Imprimir prueba*; ver cómo corta y cómo salen la ñ y las tildes (si salen mal, se cambia la tabla en `js/escpos.js`) | ✅ Probado: imprime bien desde la laptop |
| 4.3 | **Diseño en el lienzo:** vistas 10 "Impresión" (Ajustes, en la laptop), 11 "Al cobrar" (qué ve la caja: impreso, imprimiendo, no salió, comandas apagadas) y 12 "Sumar una caja" | ✅ En el lienzo |
| 4.4 | **Servidor en la laptop (Java):** sirve la app a las tablets por la red local y reenvía las impresiones a la impresora, de a una y en orden. Se arranca con `iniciar-cantina.bat` | ✅ `servidor/Cantina.java` |
| 4.5 | **Impresión en la app (ESC/POS):** al cobrar se imprimen ticket, corte, comanda y corte; reimprimir ticket o comanda por separado desde Pedidos; indicador de impresora conectada; si falla, la venta se guarda y aparecen "Reintentar" o "Seguir sin imprimir" (anotar el número a mano) | ✅ |
| 4.6 | **Interruptores centrales en la laptop:** Tickets Sí/No y Comandas Sí/No. Rigen al instante para todas las cajas, y cada caja muestra qué se está imprimiendo | ✅ Solo desde la laptop |

> **Alcance del servidor:** sirve la app, reenvía las impresiones, guarda su configuración y, desde el 11/11, una **copia central** de las ventas y movimientos de todas las cajas (ver etapa 4c).

**Decisiones de la etapa 4 (todas tomadas):**
- Los interruptores Tickets y Comandas valen **para todas las cajas a la vez**.
- Se cambian **solo desde la laptop** (Ajustes › Impresión). Las tablets solo ven el estado.
- Al prender el servidor, los interruptores quedan **como estaban la última vez** (el servidor los guarda).
- Comprobantes de **entrada y salida de caja**: se imprimen con el botón "Imprimir" de Movimientos, sin firmas (cambio del 10/11).
- Si falla la impresión: botones **Reintentar** o **Seguir sin imprimir**. No reintenta solo.
- **Reimprimir** desde Pedidos: ticket o comanda **por separado**.
- La laptop **también vende**: es la Caja 1.
- Papel de **80 mm**.
- Sumar una caja (etapa 5): QR con la dirección, traer la carta de la laptop y avisar los números de caja en uso.

### Etapa 4b · Ajustes después de la primera prueba (10/11)

| | Qué | Estado |
|---|---|---|
| ✅ | Cobrar arranca **sin medio de pago elegido** (el campo de efectivo aparece al tocar Efectivo) | Listo |
| ✅ | Tablets de **11 a 13 pulgadas** acostadas: menú y pedido más finos, ventanas compactas en pantallas bajas, nombres largos sin pisar el contador | Listo |
| ✅ | Movimientos: botones **Entrada de caja** y **Salida de caja**; los dos con comprobante numerado; **Imprimir** en cada fila | Listo |
| ✅ | Comprobantes **sin firmas** | Listo |
| ✅ | Cierre: la tabla por artículo ya no muestra "N sin cargo" | Listo |
| ✅ | **Resumen impreso del día** por caja (por artículo y por medio de pago, con totales) y **total de todas las cajas** en la laptop (Cierre › Todas las cajas): cada tablet usa "Mandar a la laptop" | Listo (vistas 13 y 14 del lienzo) |

### Etapa 4c · Copia central en la laptop (11/11)

| | Qué | Estado |
|---|---|---|
| ✅ | **Decisión:** la copia central se hace en este proyecto, con **archivos JSON** (sin base de datos). Recibe **ventas y movimientos** | Tomada |
| ✅ | Cada caja pasa sola a la laptop sus pedidos y movimientos (al vender, anular, cargar un movimiento y cada 15 s). Solo manda lo que falta o cambió | Listo (`js/central.js`) |
| ✅ | El servidor los guarda en `servidor/datos/caja-N.jsonl` y los vuelve a leer al arrancar | Listo |
| ✅ | Al pie del menú: *Ventas copiadas en la laptop* o *N cambios sin pasar* | Listo |
| ✅ | Cierre › Todas las cajas suma con la copia central (sin "Mandar a la laptop"); avisa qué cajas están sin conexión | Listo |
| ✅ | Resetear una caja de prueba también aparta su copia en la laptop | Listo |
| 🔜 | Actualizar las guías (cajero, encargado, completa): ya no hay "Mandar a la laptop" | Falta |
| 🔜 | Probar con una tablet Android real: cortar el wifi, vender y ver que pase sola al volver | Falta |

### Etapa 4d · Revisión de riesgos (11/11)

Detalle en el doc del proyecto *revision-riesgos-cantina.md*.

| | Qué | Estado |
|---|---|---|
| ✅ | **C1 · Doble toque:** las ventanas apagan sus botones mientras guardan; un doble toque (o Enter + toque) en *Confirmar y generar ticket* o en *Registrar* ya no guarda dos veces | Listo (13/11) |
| 🔜 | C2 · Tablets: que la app abra sin la laptop (ajuste de Chrome) | Falta |
| 🔜 | C3 · Lista "empezar limpio" antes del evento | Falta |

### Etapa 5 · Sumar una caja en un minuto

- **Código QR** en la laptop con la dirección de la app: la tablet nueva lo escanea y la abre.
- **"Traer la carta de la laptop"** en la primera configuración, sin pasar archivos.
- **Control de números de caja:** el servidor sabe qué números están en uso, avisa si se repite uno y sugiere el siguiente libre.

### Etapa 6 · Consolidar todas las cajas en la laptop

> Ya está hecho: con la **copia central** (etapa 4c) la laptop suma sola todas las cajas y muestra e imprime el total recaudado, por medio de pago y por artículo. Falta, si se quiere, un **Excel único consolidado** armado con esa copia.

### Etapa 7 · Documentación ágil para los usuarios

> ✅ **Guías hechas** (docs del dueño, se exportan a PDF para imprimir):
> - **Guía del cajero**: https://claude.ai/artifact/9wxKDNqSqNRxLZsGRpoH9u — vender en 5 pasos y qué hacer si pasa algo.
> - **Guía del encargado de turno**: https://claude.ai/artifact/WRBCWGaSCs1j4idaqDQGN3 — apertura, durante el turno, cierre del turno y si algo falla.
> - **Guía completa** (con la parte del organizador): https://claude.ai/artifact/6Y2F3S6Suq9BpN9AJgtwRE.
> Falta: ayuda "?" dentro de la app (a definir). Si cambia una pantalla, actualizar la guía.

Para personas jóvenes que no conocen el proyecto: poco texto, muchas imágenes, lenguaje simple.

- **Tarjeta "Vender en 5 pasos"** (una página, para imprimir y dejar al lado de cada caja): tocar artículos, revisar, cobrar, entregar ticket, llevar la comanda.
- **Guía rápida del encargado de caja:** abrir la caja (fondo), hacer un retiro, anular un pedido, cerrar y exportar.
- **"Si algo falla":** qué hacer si no imprime, si se cortó la red o si la tablet se reinició. Plan B: la app sigue vendiendo y el número se anota a mano.
- **Guía de armado** para el organizador: router, IP fijas, impresora, laptop e `iniciar-cantina.bat`, y cómo sumar una tablet.
- **Ayuda dentro de la app:** un botón "?" en cada pantalla con 2 o 3 líneas y una imagen. A definir.

### Etapa 8 · Ensayo general y preparación del evento

#### Armar la red (13/11)

Router propio **sin chip: solo red local, sin internet**. Se configura antes y va listo al evento. La app no necesita internet (no carga nada de afuera).

| | Paso | Estado |
|---|---|---|
| 🔜 | Wifi con nombre propio y **contraseña**, solo para las cajas (no para el público) | Falta |
| 🔜 | **IP fija** (reserva por DHCP) para la **laptop** y la **impresora**. Anotar las dos direcciones | Falta |
| 🔜 | Impresora conectada al router **por cable**; *Ajustes › Impresión* con su IP e *Imprimir prueba* | Falta |
| 🔜 | En la laptop, la red del router como **Privada** y Java permitido en el firewall | Falta |
| 🔜 | Probar con una tablet: abrir la app con la IP fija de la laptop, vender e imprimir | Falta |
| 🔜 | Pegar una etiqueta en el router con el nombre del wifi, la contraseña y la dirección de la app | Falta |


- Ensayo con la laptop, las tablets y la impresora reales, usando las cajas de prueba 8 y 9: 15 a 20 ventas, una anulación, un retiro, exportar y consolidar. Después, resetear las cajas de prueba.
- **Dejar todo configurado antes:** red, IP fijas, laptop y una tablet.
- **Lista para el día:** fondo de caja en cada caja, cargadores, rollos de papel, respaldo a mitad del evento.

---

## 🗂️ Más adelante (fuera de este evento)

- ~~Otro proyecto: servidor con datos centralizados.~~ Se hizo acá con archivos JSON (etapa 4c). Si más adelante hace falta, se puede pasar a SQLite.

- **Android en profundidad:** cómo se ejecuta la app ahí, uso sin conexión, ajuste de Chrome para tratar la dirección de la laptop como segura.
- Comandas por sector (cocina, barra).
- Importar artículos desde Excel o CSV.
- Otras exportaciones o filtros (hay un borrador en `borradores/exportaciones-con-filtros/`).

## ❌ Descartado para este proyecto

- **GitHub Pages:** queda para otro proyecto. La app se sirve desde la laptop.
- Impresión con diálogo de Windows o con la app RawBT: se eligió impresión directa a través del servidor de la laptop.
