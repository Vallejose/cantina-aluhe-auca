/*
 * Resumen del día para imprimir: ventas por artículo (cantidad) y por medio de
 * pago (monto), con totales. Sirve para una caja o para todas las cajas juntas.
 *
 * Para el total de todas las cajas, cada tablet manda su resumen a la laptop
 * ("Mandar a la laptop" en Cierre). El servidor guarda solo estos totales (el
 * último de cada caja), no las ventas una por una. La laptop se suma sola.
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

	// --------------------------------------------------- Con la laptop

	async mandar(r) {
		try {
			const resp = await fetch(`api/cierre?caja=${r.cajas[0]}`, {
				method: 'POST', cache: 'no-store',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(r),
			});
			// 404: la laptop sigue con el servidor de antes (no se reinició después de actualizar)
			if (resp.status === 404)
				return { estado: 'error', error: 'La laptop tiene el servidor viejo: cerrá la ventana negra y abrí iniciar-cantina.bat de nuevo' };
			const datos = await resp.json();
			if (resp.ok) await DB.guardarConfig('ultimoEnvio', { fecha: r.enviado, pedidos: r.pedidos });
			return datos;
		} catch {
			return { estado: 'error', error: 'No hay conexión con la laptop' };
		}
	},

	ultimoEnvio() {
		return DB.leerConfig('ultimoEnvio');
	},

	/** Lo que mandaron las cajas: [{ caja, recibido, datos }] */
	async recibidos() {
		try {
			const r = await fetch('api/cierres', { cache: 'no-store' });
			return r.ok ? await r.json() : [];
		} catch {
			return [];
		}
	},
};
