# Cantina Aluhe Auca

App para tomar pedidos, cobrar, generar ticket y comanda, y cerrar la caja.
Es una PWA: funciona en Windows y Android, se instala desde el navegador y
**cada caja (dispositivo) guarda sus propios datos**, sin internet ni servidor.

![Pantalla de venta](docs/capturas/02-vender.png)

- [Esquema del programa](docs/esquema.md): qué hace, decisiones tomadas, numeración y datos.
- [Capturas de todas las pantallas](docs/esquema.md#pantallas)

## Estado

👉 **[Plan de trabajo](docs/plan.md):** qué está hecho, qué falta y en qué orden.

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Base, configuración de la caja, artículos, medios de pago | ✅ Lista |
| 2 | Vender, cobrar, ticket, comanda, pedidos y anulación | ✅ Lista |
| 3 | Movimientos (fondo y retiros), cierre, exportaciones y respaldo | ✅ Lista |
| 4 | Impresión por red, con la laptop como servidor | 🔜 Siguiente |
| 5 | Sumar una caja en un minuto (QR, carta desde la laptop) | Pendiente |
| 6 | Consolidar todas las cajas en la laptop | Pendiente |
| 7 | Documentación ágil para los usuarios | Pendiente |
| 8 | Ensayo general y preparación del evento | Pendiente |

## Probarla en esta PC

Doble clic en **`abrir-cantina.bat`**. Abre el navegador en `http://localhost:8080`.
Para cerrarla, cerrá la ventana "Servidor Cantina".

Usa el servidor web que viene con Java (`jwebserver`, Java 18 o superior).

> Los datos quedan guardados en el navegador **para esa dirección exacta**.
> Abrila siempre en `http://localhost:8080` y con el mismo navegador, o vas a ver la app vacía.

Durante el evento, la laptop va a hacer de servidor: las tablets van a abrir la app
desde la laptop por la red local (etapa 4).

## Numeración

Cada dispositivo que vende es una **caja**, y elige su número la primera vez que se abre la app.

- **Cajas 1 a 7: venta.** La caja 2 numera del 2000 al 2999, y así.
  Sus datos nunca se borran.
- **Cajas 8 y 9: prueba.** Muestran una franja amarilla "MODO PRUEBA" y se
  pueden resetear desde Ajustes › Configuración (borra pedidos y movimientos; mantiene la carta).

## Archivos que genera

Casi todo sale de **Cierre › Exportaciones**. Exporta todo lo de la caja, sin los
pedidos anulados (que tienen su propia tabla).

| Archivo | Contenido |
|---|---|
| `ventas-cajaN-fecha.xlsx` | Excel con 3 pestañas: Ventas por ticket, Por medio de pago (con total) y Por artículo (con total) |
| `ventas-por-ticket-cajaN-fecha.csv` | Pedido, Fecha, Hora, Caja, Medio de pago, Venta |
| `por-medio-de-pago-cajaN-fecha.csv` | Medio, Pedidos, Monto |
| `por-articulo-cajaN-fecha.csv` | Artículo, Categoría, Cantidad, Ventas |
| `movimientos-cajaN-fecha.csv` | Hora, Tipo, Comprobante, Monto, Motivo, Quién |
| `anulados-cajaN-fecha.csv` | Pedido, Hora, Anulado a las, Medio, Monto |
| `cierre-cajaN-fecha.json` | Resumen y detalle completo (con costo y ganancia), para consolidar todas las cajas |
| `carta-cajaN-fecha.json` | Artículos y medios de pago (también desde Artículos › Exportar carta) |
| `respaldo-cajaN-fecha-hora.json` | Todo el dispositivo, desde Ajustes › Configuración, para restaurarlo |

Los CSV van separados por `;` y con coma decimal (Excel en español). Los archivos de las
cajas de prueba llevan `-PRUEBA` en el nombre. Costo y ganancia no salen en las planillas.

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
js/exportaciones.js      tablas de exportación, CSV y Excel
js/xlsx.js               generador de archivos Excel sin librerías
sw.js                    permite abrirla sin internet
docs/                    esquema del programa y capturas
borradores/              versiones guardadas que la app no usa (por ejemplo, exportaciones con filtros)
manifest.webmanifest     nombre e ícono al instalarla
```

Los montos se guardan en **centésimos** (enteros): $ 120,50 se guarda como 12050.
