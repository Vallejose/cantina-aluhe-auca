# Esquema del programa — Cantina Aluhe Auca

Una app instalable (PWA) para Windows y Android. Un empleado carga el pedido de
un cliente anónimo, cobra con un medio de pago y la app genera el ticket y la
comanda con el mismo número. Cada equipo guarda sus propios datos, sin red y
sin servidor.

## Cómo es un pedido

Elegir artículos → observaciones → cobrar (un medio de pago) → **ticket + comanda** (mismo número) → queda en Pedidos (se puede anular).

## Pantallas

| # | Pantalla | Qué hace |
|---|---|---|
| 1 | Primera vez | Elegir el número de equipo (1 a 7 venta, 8 y 9 prueba), nombre de la cantina y pie del ticket |
| 2 | Vender | Botones por artículo agrupados por categoría, buscador, cantidades con + y −, observación por línea, total |
| 3 | Cobrar | Un medio de pago; en efectivo "paga con" y vuelto, con montos rápidos |
| 4 | Ticket y comanda | Ticket con precios para el cliente; comanda sin precios para la cocina; mismo número |
| 5 | Pedidos | Lista con búsqueda y filtros, volver a ver ticket o comanda, anular |
| 6 | Caja | Fondo de caja, retiros con comprobante numerado, lo que debería haber en caja |
| 7 | Artículos | Nombre, categoría y precio (obligatorios), costo opcional; ocultar; exportar e importar la carta |
| 8 | Cierre | Ventas, costo y ganancia; por medio de pago y por artículo; arqueo; exportaciones |
| 9 | Medios de pago | Efectivo (calcula vuelto), otros, y sin cargo (no suma dinero) |

### 1 · Primera vez
![Primera vez](capturas/01-primera-vez.png)

### 2 · Vender
![Vender](capturas/02-vender.png)

### 3 · Cobrar
![Cobrar](capturas/03-cobrar.png)

### 4 · Ticket y comanda
![Ticket y comanda](capturas/04-ticket-y-comanda.png)

### 5 · Pedidos
![Pedidos](capturas/05-pedidos.png)

### 6 · Caja
![Caja](capturas/06-caja.png)

### 7 · Artículos
![Artículos](capturas/07-articulos.png)

### 8 · Cierre
![Cierre](capturas/08-cierre.png)

### 9 · Medios de pago
![Medios de pago](capturas/09-medios-de-pago.png)

*Las capturas usan datos de ejemplo.*

## Decisiones tomadas

- **Tecnología:** PWA (HTML + JavaScript), una sola app para Windows y Android.
- **Datos:** cada equipo guarda los suyos y nunca se borran, salvo en los equipos de prueba 8 y 9, que se pueden resetear.
- **Clientes:** anónimos, no se registra nada de ellos.
- **Empleado:** no se registra quién tomó el pedido.
- **Pago:** un solo medio por pedido, sin pagos divididos.
- **Sin cargo:** es un medio de pago; cuenta productos y su costo, no dinero.
- **Ganancia:** cada artículo puede tener costo (si no, es 0); cada venta guarda una copia del precio y del costo de ese momento.
- **Montos:** pesos con dos decimales; se guardan en centésimos.
- **Anular:** pedido entero, con un botón y confirmación, sin clave.
- **Comanda:** una por pedido, sin sectores y sin estados.
- **Sin** descuentos, promociones, control de stock ni fotos.
- **Pantallas:** notebook y tablet en horizontal.

## Numeración de tickets

Cuatro dígitos; el primero es el número de equipo. Se elige una sola vez, la
primera vez que se abre la app en cada dispositivo, y no se puede cambiar
después de la primera venta. Nunca se repite entre equipos y no hace falta que
se comuniquen. Avisa cuando quedan pocos números.

| Equipos | Números | Uso |
|---|---|---|
| 1 a 7 | 1000–1999 … 7000–7999 | Venta real. Los datos no se borran. |
| 8 y 9 | 8000–8999, 9000–9999 | Pruebas. Franja amarilla "MODO PRUEBA", el ticket dice "PRUEBA – NO VÁLIDO", las exportaciones llevan `-PRUEBA` y se pueden resetear. |

## Qué guarda cada equipo

- **Configuración:** número de equipo, nombre de la cantina, pie del ticket.
- **Artículo:** nombre, categoría, precio, costo, visible u oculto.
- **Medio de pago:** nombre y tipo (efectivo, otro, sin cargo).
- **Pedido:** número, fecha y hora, líneas (artículo, cantidad, precio, costo, observación), total, cobrado, medio de pago, paga con, vuelto, anulado.
- **Movimiento de caja:** fondo o retiro, monto, motivo, quién, número de comprobante, anulado.

## Exportaciones

| Desde | Archivo | Contenido |
|---|---|---|
| Artículos | `carta-equipoN-fecha.json` | Artículos y medios de pago, para cargar en otros equipos |
| Cierre | `cierre-equipoN-fecha.json` | Resumen del cierre más el detalle de pedidos y caja, para consolidar |
| Cierre | `ventas-equipoN-fecha.csv` | Una fila por ticket: pedido, fecha, hora, equipo, medio de pago, venta (sin anulados) |
| Configuración | `respaldo-equipoN-fecha-hora.json` | Todo el equipo, para restaurarlo |

## Para más adelante

- **Publicación:** dónde se aloja la app para instalarla (necesita https; opción: GitHub Pages).
- **Impresión** de tickets, comandas y comprobantes de retiro.
- **Consolidación:** juntar los cierres exportados de todos los equipos en un documento único.
- **Comandas por sector** (cocina, barra), si hace falta.
- **Formato de importación de artículos** (por ejemplo desde Excel o CSV).
- **Otras exportaciones** (a definir cuáles y con qué columnas).

## Etapas

1. ✅ Base de la app, configuración, artículos y medios de pago.
2. ✅ Vender, cobrar, ticket, comanda, pedidos y anulación.
3. ✅ Caja, comprobante de retiro, cierre, exportación y respaldo.
4. Prueba instalándola en Windows y en Android.
