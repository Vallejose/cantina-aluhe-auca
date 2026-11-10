/*
 * Exportaciones del cierre: arma las tablas a partir de los pedidos y los
 * movimientos guardados y las convierte en CSV o en un Excel con varias pestañas.
 *
 * La pantalla exporta todo, sin los pedidos anulados (filtros por defecto).
 * La lógica de filtros queda acá por si se vuelve a usar; la pantalla con
 * filtros está en borradores/exportaciones-con-filtros/.
 *
 * Las tablas se arman una sola vez y de ahí salen los dos formatos, así el
 * CSV y el Excel siempre tienen exactamente los mismos números.
 *
 * Costo y ganancia NO salen en estas planillas (decisión del grupo, por ahora).
 * El archivo JSON para consolidar sí los guarda.
 */
const Exportaciones = (() => {

	/** Filtros vacíos = se exporta todo (salvo los anulados, que por defecto no van) */
	const FILTROS_INICIALES = { desde: '', hasta: '', numeroDesde: '', numeroHasta: '', medio: '', anulados: 'no' };

	const fecha = iso => {
		const d = new Date(iso);
		return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
	};

	/** Compara fechas guardadas (ISO, UTC) con lo elegido en el filtro (hora local) */
	const dentroDeFechas = (iso, f) => {
		const t = new Date(iso).getTime();
		if (f.desde && t < new Date(f.desde).getTime()) return false;
		// "hasta 23:40" incluye todo ese minuto
		if (f.hasta && t >= new Date(f.hasta).getTime() + 60000) return false;
		return true;
	};

	function filtrarPedidos(pedidos, f, { ignorarAnulados = false } = {}) {
		const desde = f.numeroDesde === '' ? -Infinity : Number(f.numeroDesde);
		const hasta = f.numeroHasta === '' ? Infinity : Number(f.numeroHasta);
		return pedidos.filter(p =>
			dentroDeFechas(p.fecha, f) &&
			p.numero >= desde && p.numero <= hasta &&
			(!f.medio || p.medio.nombre === f.medio) &&
			(ignorarAnulados || (f.anulados === 'si') || (f.anulados === 'solo' ? p.anulado : !p.anulado)));
	}

	function filtrarMovimientos(movimientos, f) {
		return movimientos.filter(m =>
			dentroDeFechas(m.fecha, f) &&
			(f.anulados === 'si' || (f.anulados === 'solo' ? m.anulado : !m.anulado)));
	}

	/** Lee todo lo guardado y devuelve las tablas ya filtradas */
	async function tablas(f = FILTROS_INICIALES) {
		const todosPedidos = (await DB.todos('pedidos')).sort((a, b) => a.numero - b.numero);
		const pedidos = filtrarPedidos(todosPedidos, f);
		const movimientos = filtrarMovimientos(await Datos.listarMovimientos(), f);
		const anulados = filtrarPedidos(todosPedidos, f, { ignorarAnulados: true }).filter(p => p.anulado);

		// --- Ventas por ticket
		const ventasPorTicket = {
			nombre: 'Ventas por ticket',
			columnas: [
				{ titulo: 'Pedido', tipo: 'numero', ancho: 10 }, { titulo: 'Fecha', tipo: 'texto', ancho: 12 },
				{ titulo: 'Hora', tipo: 'texto', ancho: 8 }, { titulo: 'Caja', tipo: 'numero', ancho: 7 },
				{ titulo: 'Medio de pago', tipo: 'texto', ancho: 18 }, { titulo: 'Venta', tipo: 'dinero', ancho: 14 }],
			filas: pedidos.map(p => [p.numero, fecha(p.fecha), Util.hora(p.fecha), p.equipo, p.medio.nombre, p.cobrado]),
		};

		// --- Por medio de pago
		const medios = {};
		for (const p of pedidos) {
			const m = (medios[p.medio.nombre] ??= { pedidos: 0, monto: 0 });
			m.pedidos++;
			m.monto += p.cobrado;
		}
		const filasMedios = Object.entries(medios).sort((a, b) => b[1].monto - a[1].monto)
			.map(([nombre, m]) => [nombre, m.pedidos, m.monto]);
		const porMedio = {
			nombre: 'Por medio de pago',
			columnas: [{ titulo: 'Medio', tipo: 'texto', ancho: 20 }, { titulo: 'Pedidos', tipo: 'numero', ancho: 10 }, { titulo: 'Monto', tipo: 'dinero', ancho: 14 }],
			filas: filasMedios,
			total: ['Total', filasMedios.reduce((s, f) => s + f[1], 0), filasMedios.reduce((s, f) => s + f[2], 0)],
		};

		// --- Por artículo (lo entregado sin cargo suma cantidad pero no ventas)
		const articulos = {};
		for (const p of pedidos)
			for (const l of p.lineas) {
				const a = (articulos[l.nombre] ??= { categoria: l.categoria, cantidad: 0, ventas: 0 });
				a.cantidad += l.cantidad;
				if (p.medio.tipo !== 'sincargo') a.ventas += l.precio * l.cantidad;
			}
		const filasArticulos = Object.entries(articulos)
			.sort((a, b) => b[1].ventas - a[1].ventas || b[1].cantidad - a[1].cantidad)
			.map(([nombre, a]) => [nombre, a.categoria, a.cantidad, a.ventas]);
		const porArticulo = {
			nombre: 'Por artículo',
			columnas: [
				{ titulo: 'Artículo', tipo: 'texto', ancho: 26 }, { titulo: 'Categoría', tipo: 'texto', ancho: 16 },
				{ titulo: 'Cantidad', tipo: 'numero', ancho: 10 }, { titulo: 'Ventas', tipo: 'dinero', ancho: 14 }],
			filas: filasArticulos,
			total: ['Total', '', filasArticulos.reduce((s, f) => s + f[2], 0), filasArticulos.reduce((s, f) => s + f[3], 0)],
		};

		// --- Movimientos de efectivo
		const tablaMovimientos = {
			nombre: 'Movimientos',
			columnas: [
				{ titulo: 'Hora', tipo: 'texto', ancho: 8 }, { titulo: 'Tipo', tipo: 'texto', ancho: 20 },
				{ titulo: 'Comprobante', tipo: 'texto', ancho: 13 }, { titulo: 'Monto', tipo: 'dinero', ancho: 14 },
				{ titulo: 'Motivo', tipo: 'texto', ancho: 30 }, { titulo: 'Quién', tipo: 'texto', ancho: 16 }],
			filas: movimientos.map(m => [
				Util.hora(m.fecha),
				(m.tipo === 'fondo' ? 'Entrada de caja' : 'Salida de caja') + (m.anulado ? ' (anulado)' : ''),
				m.comprobante || '', m.monto, m.motivo || '', m.quien || '']),
		};

		// --- Pedidos anulados (siempre solo anulados, con los demás filtros)
		const tablaAnulados = {
			nombre: 'Pedidos anulados',
			columnas: [
				{ titulo: 'Pedido', tipo: 'numero', ancho: 10 }, { titulo: 'Hora', tipo: 'texto', ancho: 8 },
				{ titulo: 'Anulado a las', tipo: 'texto', ancho: 14 }, { titulo: 'Medio', tipo: 'texto', ancho: 18 },
				{ titulo: 'Monto', tipo: 'dinero', ancho: 14 }],
			filas: anulados.map(p => [p.numero, Util.hora(p.fecha), Util.hora(p.anuladoEn), p.medio.nombre, p.cobrado]),
		};

		return {
			ventasPorTicket, porMedio, porArticulo, movimientos: tablaMovimientos, anulados: tablaAnulados,
			cantidadPedidos: pedidos.length, cantidadMovimientos: movimientos.length,
			mediosDisponibles: [...new Set(todosPedidos.map(p => p.medio.nombre))].sort(),
		};
	}

	/**
	 * Una tabla en CSV para Excel en español: separado por ";", coma decimal,
	 * y con BOM al principio para que Excel lea bien las tildes y la ñ.
	 * El CSV no lleva fila de total (eso queda para el Excel).
	 */
	function csv(tabla) {
		const celda = (valor, tipo) => {
			if (valor == null) return '';
			if (tipo === 'dinero') return (valor / 100).toFixed(2).replace('.', ',');
			const t = String(valor);
			return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
		};
		const lineas = [tabla.columnas.map(c => celda(c.titulo)).join(';')];
		for (const fila of tabla.filas) lineas.push(fila.map((v, i) => celda(v, tabla.columnas[i].tipo)).join(';'));
		return '﻿' + lineas.join('\r\n');
	}

	/** El Excel con las tres pestañas de ventas */
	const excelVentas = t => XLSX.libro([t.ventasPorTicket, t.porMedio, t.porArticulo]);

	return { FILTROS_INICIALES, tablas, csv, excelVentas };
})();
