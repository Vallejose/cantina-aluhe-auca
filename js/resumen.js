/*
 * Resumen del día para imprimir: ventas por artículo (cantidad) y por medio de
 * pago (monto), con totales. Sirve para una caja o para todas las cajas juntas.
 *
 * El total de todas las cajas se arma en la laptop con la copia central de
 * cada caja (js/central.js).
 */
const Resumen = {

	/** Resumen de esta caja, a partir del cierre */
	deCaja(k) {
		return {
			tipo: 'cantina-resumen',
			version: 1,
			cajas: [k.equipo],
			prueba: !!k.prueba,
			enviado: new Date().toISOString(),
			desdeNumero: k.desdeNumero,
			hastaNumero: k.hastaNumero,
			pedidos: k.pedidosValidos,
			porArticulo: k.porArticulo.map(a => ({ nombre: a.nombre, cantidad: a.cantidad })),
			porMedio: k.porMedio.map(m => ({ nombre: m.nombre, tipo: m.tipo, pedidos: m.pedidos, monto: m.monto })),
		};
	},

	/** Junta varios resúmenes en uno: suma por nombre de artículo y de medio de pago */
	combinar(lista) {
		const articulos = {};
		const medios = {};
		for (const r of lista) {
			r.porArticulo.forEach(a => { (articulos[a.nombre] ??= { nombre: a.nombre, cantidad: 0 }).cantidad += a.cantidad; });
			r.porMedio.forEach(m => {
				const x = (medios[m.nombre] ??= { nombre: m.nombre, tipo: m.tipo, pedidos: 0, monto: 0 });
				x.pedidos += m.pedidos;
				x.monto += m.monto;
			});
		}
		return {
			tipo: 'cantina-resumen',
			cajas: lista.flatMap(r => r.cajas).sort((a, b) => a - b),
			prueba: lista.some(r => r.prueba),
			pedidos: lista.reduce((s, r) => s + r.pedidos, 0),
			porArticulo: Object.values(articulos),
			porMedio: Object.values(medios),
		};
	},

	/** Lo que se imprime y se muestra: artículos de más a menos vendidos; medios con plata (sin "Sin cargo") */
	ordenado(r) {
		const porArticulo = [...r.porArticulo].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
		const porMedio = r.porMedio.filter(m => m.tipo !== 'sincargo').sort((a, b) => b.monto - a.monto);
		return {
			porArticulo, porMedio,
			totalArticulos: porArticulo.reduce((s, a) => s + a.cantidad, 0),
			totalMonto: porMedio.reduce((s, m) => s + m.monto, 0),
		};
	},

	async imprimir(r, titulo, detalle) {
		const cfg = await Datos.configuracion();
		return Impresion.enviar([{ tipo: 'resumen', bytes: EscPos.resumen(r, cfg, titulo, detalle) }],
			{ caja: cfg.equipo, que: titulo.charAt(0) + titulo.slice(1).toLowerCase() });
	},
};
