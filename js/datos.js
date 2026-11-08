/*
 * Reglas de negocio de la cantina. Las pantallas llaman a estas funciones y
 * nunca hablan directo con DB: así las reglas (validaciones, valores por
 * defecto, formato de los archivos) están en un solo lugar.
 */
const Datos = (() => {

	// ------------------------------------------------------------ Configuración

	/** Tipos de medio de pago. "efectivo" calcula vuelto; "sincargo" no suma dinero. */
	const TIPOS_MEDIO = {
		efectivo: 'Efectivo (calcula vuelto)',
		otro: 'Otro (tarjeta, transferencia...)',
		sincargo: 'Sin cargo (no suma dinero)',
	};

	const MEDIOS_INICIALES = [
		{ nombre: 'Efectivo', tipo: 'efectivo', activo: true },
		{ nombre: 'Débito', tipo: 'otro', activo: true },
		{ nombre: 'Crédito', tipo: 'otro', activo: true },
		{ nombre: 'Transferencia', tipo: 'otro', activo: true },
		{ nombre: 'Mercado Pago', tipo: 'otro', activo: true },
		{ nombre: 'Sin cargo', tipo: 'sincargo', activo: true },
	];

	const NOMBRE_POR_DEFECTO = 'Cantina Aluhe Auca';

	/** Equipos 1 a 7: venta real. Equipos 8 y 9: pruebas (se pueden resetear). */
	const EQUIPOS_VENTA = [1, 2, 3, 4, 5, 6, 7];
	const EQUIPOS_PRUEBA = [8, 9];
	const esPrueba = equipo => EQUIPOS_PRUEBA.includes(Number(equipo));

	async function configuracion() {
		const equipo = await DB.leerConfig('equipo');
		return {
			equipo,
			prueba: equipo != null && esPrueba(equipo),
			nombreCantina: (await DB.leerConfig('nombreCantina')) || '',
			pieTicket: (await DB.leerConfig('pieTicket')) || '',
		};
	}

	/** El equipo está configurado cuando ya tiene su número (1 a 9) */
	async function estaConfigurado() {
		return (await DB.leerConfig('equipo')) != null;
	}

	/**
	 * Guarda la configuración. La primera vez, además, carga los medios de pago
	 * de ejemplo para que el equipo quede listo para vender.
	 */
	async function guardarConfiguracion({ equipo, nombreCantina, pieTicket }) {
		const n = Number(equipo);
		if (!Number.isInteger(n) || n < 1 || n > 9)
			throw new Error('El número de caja tiene que ser del 1 al 9');
		if (!nombreCantina.trim())
			throw new Error('Poné el nombre de la cantina: sale en el ticket');

		const primeraVez = !(await estaConfigurado());
		const anterior = await DB.leerConfig('equipo');
		if (anterior != null && anterior !== n && (await hayVentas()))
			throw new Error('No se puede cambiar el número de caja: ya hay ventas numeradas con el ' + anterior);

		await DB.guardarConfig('equipo', n);
		await DB.guardarConfig('nombreCantina', nombreCantina.trim());
		await DB.guardarConfig('pieTicket', pieTicket.trim());

		if (primeraVez && (await DB.todos('mediosPago')).length === 0)
			for (const medio of MEDIOS_INICIALES) await DB.guardar('mediosPago', { ...medio });
	}

	/** Numeración: el equipo 1 usa 1000-1999, el equipo 2 usa 2000-2999, ... */
	function rangoNumeracion(equipo) {
		return { desde: equipo * 1000, hasta: equipo * 1000 + 999 };
	}

	async function hayVentas() {
		return (await DB.todos('pedidos')).length > 0;
	}

	/**
	 * Solo para los equipos de prueba (8 y 9): borra pedidos y movimientos de
	 * caja, así la numeración vuelve a empezar desde 8000 / 9000. La carta, los
	 * medios de pago y la configuración se mantienen. En los equipos de venta
	 * esto no existe: sus datos nunca se borran.
	 */
	async function resetearEquipoDePrueba() {
		const equipo = await DB.leerConfig('equipo');
		if (!esPrueba(equipo))
			throw new Error('Solo las cajas de prueba (8 y 9) se pueden resetear');
		await DB.reemplazarTodo('pedidos', []);
		await DB.reemplazarTodo('movimientos', []);
	}

	async function contarDatosDePrueba() {
		return {
			pedidos: (await DB.todos('pedidos')).length,
			movimientos: (await DB.todos('movimientos')).length,
		};
	}

	// ---------------------------------------------------------------- Artículos

	async function listarArticulos() {
		const lista = await DB.todos('articulos');
		return lista.sort((a, b) =>
			(a.categoria || '').localeCompare(b.categoria || '') || a.nombre.localeCompare(b.nombre));
	}

	async function categorias() {
		const lista = await DB.todos('articulos');
		return [...new Set(lista.map(a => a.categoria).filter(Boolean))].sort();
	}

	/**
	 * Alta o modificación. Precio y costo vienen en centésimos.
	 * Cambiar el precio NO cambia las ventas ya hechas: cada venta guarda una
	 * copia del precio y del costo del momento (etapa 2).
	 */
	async function guardarArticulo(articulo) {
		// Obligatorios: nombre, categoría y precio. El costo es opcional (si no se pone, es 0).
		const nombre = (articulo.nombre || '').trim();
		const categoria = (articulo.categoria || '').trim();
		const costo = articulo.costo ?? 0;
		if (!nombre) throw new Error('Falta el nombre');
		if (!categoria) throw new Error('Falta la categoría (ej.: Comidas, Bebidas)');
		if (articulo.precio == null || articulo.precio <= 0) throw new Error('El precio de venta tiene que ser mayor que cero');
		if (costo < 0) throw new Error('El costo no puede ser negativo');

		const repetido = (await DB.todos('articulos'))
			.find(a => a.nombre.toLowerCase() === nombre.toLowerCase() && a.id !== articulo.id);
		if (repetido) throw new Error('Ya existe un artículo llamado ' + repetido.nombre);

		const datos = {
			nombre,
			categoria,
			precio: articulo.precio,
			costo,
			activo: articulo.activo !== false,
		};
		if (articulo.id != null) datos.id = articulo.id;
		return DB.guardar('articulos', datos);
	}

	/**
	 * Se puede borrar siempre: las ventas guardan su propia copia del nombre,
	 * el precio y el costo, así que los números del cierre no cambian.
	 */
	const borrarArticulo = id => DB.borrar('articulos', id);

	// ----------------------------------------------------------- Medios de pago

	async function listarMedios() {
		return (await DB.todos('mediosPago')).sort((a, b) => a.id - b.id);
	}

	async function guardarMedio(medio) {
		const nombre = (medio.nombre || '').trim();
		if (!nombre) throw new Error('Falta el nombre');
		if (!TIPOS_MEDIO[medio.tipo]) throw new Error('Elegí el tipo');
		const repetido = (await DB.todos('mediosPago'))
			.find(m => m.nombre.toLowerCase() === nombre.toLowerCase() && m.id !== medio.id);
		if (repetido) throw new Error('Ya existe un medio de pago llamado ' + repetido.nombre);

		const datos = { nombre, tipo: medio.tipo, activo: medio.activo !== false };
		if (medio.id != null) datos.id = medio.id;
		return DB.guardar('mediosPago', datos);
	}

	const borrarMedio = id => DB.borrar('mediosPago', id);

	// ------------------------------------------------------------------ Pedidos

	/** Cuántos números antes del último empieza a avisar */
	const AVISO_NUMERACION = 50;

	/** El próximo número de pedido de este equipo y cuántos le quedan */
	async function estadoNumeracion() {
		const r = rangoNumeracion(await DB.leerConfig('equipo'));
		const numeros = await DB.operar('pedidos', 'readonly', (tx, fin) =>
			DB.esperar(tx.objectStore('pedidos').getAllKeys()).then(fin));
		const proximo = numeros.length ? Math.max(...numeros) + 1 : r.desde;
		return { proximo, hasta: r.hasta, restantes: Math.max(0, r.hasta - proximo + 1) };
	}

	/**
	 * Confirma la venta. `lineas` = [{ articuloId, cantidad, observacion }].
	 *
	 * Cada línea guarda una COPIA del nombre, el precio y el costo del momento:
	 * si después cambia la carta, el ticket y el cierre no cambian.
	 *
	 * El número se calcula y se guarda dentro de la misma transacción, así dos
	 * pestañas abiertas a la vez nunca pueden repetir un número.
	 */
	async function confirmarPedido({ lineas, medioId, pagaCon }) {
		if (!lineas.length) throw new Error('El pedido está vacío');
		const cfg = await configuracion();
		const medio = await DB.obtener('mediosPago', medioId);
		if (!medio || !medio.activo) throw new Error('Elegí un medio de pago');

		const articulos = await DB.todos('articulos');
		const copia = lineas.map(l => {
			const a = articulos.find(x => x.id === l.articuloId);
			if (!a) throw new Error('Un artículo del pedido ya no está en la carta');
			if (!Number.isInteger(l.cantidad) || l.cantidad < 1) throw new Error('Cantidad inválida en ' + a.nombre);
			return {
				articuloId: a.id, nombre: a.nombre, categoria: a.categoria,
				precio: a.precio, costo: a.costo ?? 0, cantidad: l.cantidad,
				observacion: (l.observacion || '').trim(),
			};
		});

		const total = copia.reduce((suma, l) => suma + l.precio * l.cantidad, 0);
		let paga = null, vuelto = null;
		if (medio.tipo === 'efectivo') {
			paga = pagaCon ?? total;
			if (paga < total) throw new Error('El monto con que paga no alcanza');
			vuelto = paga - total;
		}

		const r = rangoNumeracion(cfg.equipo);
		return DB.operar('pedidos', 'readwrite', async (tx, fin) => {
			const almacen = tx.objectStore('pedidos');
			const claves = await DB.esperar(almacen.getAllKeys());
			const numero = claves.length ? Math.max(...claves) + 1 : r.desde;
			if (numero > r.hasta) throw new Error(`Se terminó la numeración de esta caja (${r.desde} a ${r.hasta})`);

			const pedido = {
				numero,
				equipo: cfg.equipo,
				prueba: cfg.prueba,
				fecha: new Date().toISOString(),
				lineas: copia,
				total,                                          // valor de lista del pedido
				cobrado: medio.tipo === 'sincargo' ? 0 : total, // lo que entró de dinero
				medio: { id: medio.id, nombre: medio.nombre, tipo: medio.tipo },
				pagaCon: paga,
				vuelto,
				anulado: false,
				anuladoEn: null,
			};
			await DB.esperar(almacen.add(pedido));
			fin(pedido);
		});
	}

	async function listarPedidos() {
		return (await DB.todos('pedidos')).sort((a, b) => b.numero - a.numero);
	}

	const obtenerPedido = numero => DB.obtener('pedidos', numero);

	/** Anula el pedido entero. Queda guardado y visible, pero no suma en el cierre. */
	async function anularPedido(numero) {
		const pedido = await DB.obtener('pedidos', numero);
		if (!pedido) throw new Error('No existe el pedido ' + numero);
		if (pedido.anulado) throw new Error('El pedido ' + numero + ' ya estaba anulado');
		pedido.anulado = true;
		pedido.anuladoEn = new Date().toISOString();
		await DB.guardar('pedidos', pedido);
		return pedido;
	}

	/** "2 Chorizo al pan, 3 Torta frita" */
	const resumenLineas = pedido => pedido.lineas.map(l => `${l.cantidad} ${l.nombre}`).join(', ');

	const cantidadArticulos = pedido => pedido.lineas.reduce((s, l) => s + l.cantidad, 0);

	// --------------------------------------------------------------------- Caja

	/**
	 * Movimientos de efectivo que no son ventas:
	 *   fondo   plata que se pone en la caja (el cambio para empezar)
	 *   retiro  plata que se saca durante el evento; lleva comprobante numerado
	 */
	async function listarMovimientos() {
		return (await DB.todos('movimientos')).sort((a, b) => a.fecha.localeCompare(b.fecha));
	}

	async function registrarMovimiento({ tipo, monto, motivo, quien }) {
		if (tipo !== 'fondo' && tipo !== 'retiro') throw new Error('Tipo de movimiento inválido');
		if (monto == null || monto <= 0) throw new Error('El monto tiene que ser mayor que cero');
		motivo = (motivo || '').trim();
		quien = (quien || '').trim();
		if (tipo === 'retiro' && !motivo) throw new Error('Poné el motivo del retiro');

		const cfg = await configuracion();
		const movimiento = {
			tipo, monto, motivo, quien,
			fecha: new Date().toISOString(),
			equipo: cfg.equipo,
			prueba: cfg.prueba,
			anulado: false,
		};
		// Los retiros se numeran por equipo: 2-01, 2-02, ...
		if (tipo === 'retiro') {
			const retiros = (await DB.todos('movimientos')).filter(m => m.tipo === 'retiro').length;
			movimiento.comprobante = `${cfg.equipo}-${String(retiros + 1).padStart(2, '0')}`;
		}
		movimiento.id = await DB.guardar('movimientos', movimiento);
		return movimiento;
	}

	/** Para corregir un movimiento cargado por error: queda visible, tachado, y no cuenta */
	async function anularMovimiento(id) {
		const m = await DB.obtener('movimientos', id);
		if (!m || m.anulado) throw new Error('Ese movimiento no existe o ya estaba anulado');
		m.anulado = true;
		m.anuladoEn = new Date().toISOString();
		await DB.guardar('movimientos', m);
	}

	/** Efectivo que debería haber en la caja: fondo + ventas en efectivo − retiros */
	function calcularCaja(pedidos, movimientos) {
		const validos = movimientos.filter(m => !m.anulado);
		const suma = tipo => validos.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
		const fondo = suma('fondo');
		const retiros = suma('retiro');
		const ventasEfectivo = pedidos
			.filter(p => !p.anulado && p.medio.tipo === 'efectivo')
			.reduce((s, p) => s + p.cobrado, 0);
		return {
			fondo, retiros, ventasEfectivo,
			cantidadRetiros: validos.filter(m => m.tipo === 'retiro').length,
			esperado: fondo + ventasEfectivo - retiros,
		};
	}

	async function resumenCaja() {
		return calcularCaja(await DB.todos('pedidos'), await DB.todos('movimientos'));
	}

	// ------------------------------------------------------------------- Cierre

	/**
	 * Todos los números del cierre, a partir de los pedidos guardados.
	 *
	 *   ventas   = dinero que entró (lo "sin cargo" suma 0)
	 *   costo    = costo de TODO lo entregado, también lo sin cargo
	 *   ganancia = ventas − costo
	 *
	 * Los pedidos anulados no cuentan para nada; se informan aparte.
	 */
	async function calcularCierre() {
		const pedidos = (await DB.todos('pedidos')).sort((a, b) => a.numero - b.numero);
		const movimientos = await DB.todos('movimientos');
		const validos = pedidos.filter(p => !p.anulado);
		const anulados = pedidos.filter(p => p.anulado);

		const porMedio = {};
		const porArticulo = {};
		const sinCargo = { pedidos: 0, productos: 0, costo: 0, valorLista: 0 };
		let ventas = 0, costo = 0;

		for (const p of validos) {
			const esSinCargo = p.medio.tipo === 'sincargo';
			const m = (porMedio[p.medio.nombre] ??= { nombre: p.medio.nombre, tipo: p.medio.tipo, pedidos: 0, monto: 0 });
			m.pedidos++;
			m.monto += p.cobrado;
			ventas += p.cobrado;
			if (esSinCargo) { sinCargo.pedidos++; sinCargo.valorLista += p.total; }

			for (const l of p.lineas) {
				const costoLinea = (l.costo ?? 0) * l.cantidad;
				const ventaLinea = esSinCargo ? 0 : l.precio * l.cantidad;
				const a = (porArticulo[l.nombre] ??= { nombre: l.nombre, categoria: l.categoria, cantidad: 0, sinCargo: 0, ventas: 0, costo: 0 });
				a.cantidad += l.cantidad;
				a.ventas += ventaLinea;
				a.costo += costoLinea;
				if (esSinCargo) { a.sinCargo += l.cantidad; sinCargo.productos += l.cantidad; sinCargo.costo += costoLinea; }
				costo += costoLinea;
			}
		}

		const articulos = Object.values(porArticulo)
			.map(a => ({ ...a, ganancia: a.ventas - a.costo }))
			.sort((x, y) => y.ventas - x.ventas || y.cantidad - x.cantidad);

		const fechas = pedidos.map(p => p.fecha).sort();
		const cfg = await configuracion();
		return {
			equipo: cfg.equipo,
			prueba: cfg.prueba,
			generado: new Date().toISOString(),
			desdeNumero: pedidos[0]?.numero ?? null,
			hastaNumero: pedidos.at(-1)?.numero ?? null,
			desdeFecha: fechas[0] ?? null,
			hastaFecha: fechas.at(-1) ?? null,
			pedidosValidos: validos.length,
			ventas, costo,
			ganancia: ventas - costo,
			margen: ventas ? Math.round((ventas - costo) * 100 / ventas) : 0,
			productos: articulos.reduce((s, a) => s + a.cantidad, 0),
			porMedio: Object.values(porMedio).sort((a, b) => b.monto - a.monto),
			porArticulo: articulos,
			sinCargo,
			anulados: { cantidad: anulados.length, monto: anulados.reduce((s, p) => s + p.cobrado, 0) },
			caja: calcularCaja(pedidos, movimientos),
		};
	}

	/**
	 * Archivo del cierre para consolidar después todos los equipos. Lleva el
	 * resumen y también el detalle (pedidos y movimientos), así la
	 * consolidación puede recalcular lo que haga falta.
	 */
	async function exportarCierre() {
		return JSON.stringify({
			tipo: 'cantina-cierre',
			version: 1,
			cierre: await calcularCierre(),
			pedidos: (await DB.todos('pedidos')).sort((a, b) => a.numero - b.numero),
			movimientos: await listarMovimientos(),
		}, null, 2);
	}

	// ------------------------------------------------------- Respaldo completo

	const ALMACENES = ['articulos', 'mediosPago', 'pedidos', 'movimientos'];

	async function exportarRespaldo() {
		const config = {};
		for (const clave of ['equipo', 'nombreCantina', 'pieTicket'])
			config[clave] = await DB.leerConfig(clave);
		const respaldo = { tipo: 'cantina-respaldo', version: 1, exportado: new Date().toISOString(), config };
		for (const a of ALMACENES) respaldo[a] = await DB.todos(a);
		await DB.guardarConfig('ultimoRespaldo', respaldo.exportado);
		return JSON.stringify(respaldo, null, 2);
	}

	function leerRespaldo(texto) {
		let r;
		try { r = JSON.parse(texto); } catch { throw new Error('El archivo no es un respaldo válido'); }
		if (r?.tipo !== 'cantina-respaldo' || !r.config || ALMACENES.some(a => !Array.isArray(r[a])))
			throw new Error('El archivo no es un respaldo de esta aplicación');
		const n = Number(r.config.equipo);
		if (!Number.isInteger(n) || n < 1 || n > 9) throw new Error('El respaldo no tiene un número de caja válido');
		return r;
	}

	/**
	 * Reemplaza TODO lo del dispositivo por el respaldo (todo o nada).
	 * Para no pisar ventas de otro equipo por error: si este dispositivo ya
	 * tiene ventas, el respaldo tiene que ser del mismo número de equipo.
	 */
	async function restaurarRespaldo(r) {
		const actual = await DB.leerConfig('equipo');
		if (actual != null && actual !== Number(r.config.equipo) && (await hayVentas()))
			throw new Error(`Este dispositivo es la Caja ${actual} y tiene ventas: no se puede cargar un respaldo de la Caja ${r.config.equipo}`);

		await DB.operar(['config', ...ALMACENES], 'readwrite', async tx => {
			for (const a of ['config', ...ALMACENES]) await DB.esperar(tx.objectStore(a).clear());
			const config = tx.objectStore('config');
			for (const [clave, valor] of Object.entries(r.config))
				if (valor != null) await DB.esperar(config.put(valor, clave));
			await DB.esperar(config.put(r.exportado, 'ultimoRespaldo'));
			for (const a of ALMACENES)
				for (const objeto of r[a]) await DB.esperar(tx.objectStore(a).put(objeto));
		});
	}

	const ultimoRespaldo = () => DB.leerConfig('ultimoRespaldo');

	// ------------------------------------------------- Exportar / importar carta

	/**
	 * La carta (artículos + medios de pago) se arma en un equipo y se pasa a los
	 * demás con un archivo. No lleva ventas ni configuración del equipo.
	 */
	async function exportarCarta() {
		const cfg = await configuracion();
		return JSON.stringify({
			tipo: 'cantina-carta',
			version: 1,
			exportado: new Date().toISOString(),
			desdeEquipo: cfg.equipo,
			articulos: (await listarArticulos()).map(({ id, ...resto }) => resto),
			mediosPago: (await listarMedios()).map(({ id, ...resto }) => resto),
		}, null, 2);
	}

	/** Lee el archivo y verifica que sea una carta válida, sin guardar nada todavía */
	function leerCarta(texto) {
		let carta;
		try { carta = JSON.parse(texto); } catch { throw new Error('El archivo no es una carta válida'); }
		if (carta?.tipo !== 'cantina-carta' || !Array.isArray(carta.articulos) || !Array.isArray(carta.mediosPago))
			throw new Error('El archivo no es una carta exportada desde esta aplicación');
		for (const a of carta.articulos)
			if (!a.nombre || !a.categoria || !Number.isInteger(a.precio) || (a.costo != null && !Number.isInteger(a.costo)))
				throw new Error('La carta tiene un artículo con datos incompletos: ' + (a.nombre || '(sin nombre)'));
		for (const m of carta.mediosPago)
			if (!m.nombre || !TIPOS_MEDIO[m.tipo])
				throw new Error('La carta tiene un medio de pago inválido: ' + (m.nombre || '(sin nombre)'));
		return carta;
	}

	/** Reemplaza la carta de este equipo por la del archivo. Las ventas no se tocan. */
	async function importarCarta(carta) {
		await DB.reemplazarTodo('articulos', carta.articulos.map(a => ({
			nombre: a.nombre, categoria: a.categoria, precio: a.precio, costo: a.costo ?? 0, activo: a.activo !== false,
		})));
		await DB.reemplazarTodo('mediosPago', carta.mediosPago.map(m => ({
			nombre: m.nombre, tipo: m.tipo, activo: m.activo !== false,
		})));
	}

	return {
		TIPOS_MEDIO, NOMBRE_POR_DEFECTO, EQUIPOS_VENTA, EQUIPOS_PRUEBA, esPrueba,
		configuracion, estaConfigurado, guardarConfiguracion, rangoNumeracion, hayVentas,
		resetearEquipoDePrueba, contarDatosDePrueba,
		listarArticulos, categorias, guardarArticulo, borrarArticulo,
		listarMedios, guardarMedio, borrarMedio,
		AVISO_NUMERACION, estadoNumeracion, confirmarPedido, listarPedidos, obtenerPedido, anularPedido,
		resumenLineas, cantidadArticulos,
		listarMovimientos, registrarMovimiento, anularMovimiento, resumenCaja,
		calcularCierre, exportarCierre,
		exportarRespaldo, leerRespaldo, restaurarRespaldo, ultimoRespaldo,
		exportarCarta, leerCarta, importarCarta,
	};
})();
