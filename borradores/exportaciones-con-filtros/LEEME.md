# Borrador: pestaña Exportaciones con filtros

Primera versión de **Cierre › Exportaciones**, guardada antes de simplificarla
(08/11/2026). **La app no usa estos archivos**: quedan como referencia por si se
quiere volver a sumar algo.

Qué tenía esta versión:

- **Filtros**: fecha y hora desde/hasta, número de pedido desde/hasta, medio de
  pago y pedidos anulados (no incluir / incluir / solo anulados), con un aviso de
  cuántos pedidos y movimientos se exportaban.
- Tarjeta del Excel con las columnas de cada pestaña y el nombre del archivo.
- Desplegable de CSV con descripción, columnas y nombre de archivo por tabla.
- Notas al pie sobre el formato del CSV.

| Archivo | Qué es |
|---|---|
| `cierre.js` | La pantalla Cierre completa de esa versión (`dibujarExportaciones`) |
| `exportaciones.js` | Las tablas con la lógica de filtros (`filtrarPedidos`, `filtrarMovimientos`) |
| `estilos-exportaciones.css` | Los estilos de esa pestaña |
| `captura.png` | Cómo se veía |
