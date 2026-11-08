/*
 * Acceso al almacenamiento del dispositivo (IndexedDB).
 *
 * Es una base de datos que trae el navegador: los datos quedan guardados en
 * ESTE equipo, funcionan sin internet y no se comparten con otros equipos.
 *
 * "Almacenes" (el equivalente a las tablas):
 *   config       clave -> valor (número de equipo, nombre de la cantina, ...)
 *   articulos    la carta
 *   mediosPago   efectivo, débito, transferencia, sin cargo, ...
 *   pedidos      las ventas, con su número como clave            (etapa 2)
 *   movimientos  fondo de caja y retiros de efectivo              (etapa 3)
 */
const DB = (() => {

	const NOMBRE = 'cantina';
	const VERSION = 1;
	let conexion = null;

	function abrir() {
		if (conexion) return Promise.resolve(conexion);
		return new Promise((ok, mal) => {
			const pedido = indexedDB.open(NOMBRE, VERSION);
			pedido.onupgradeneeded = () => {
				const db = pedido.result;
				db.createObjectStore('config');
				db.createObjectStore('articulos', { keyPath: 'id', autoIncrement: true });
				db.createObjectStore('mediosPago', { keyPath: 'id', autoIncrement: true });
				db.createObjectStore('pedidos', { keyPath: 'numero' });
				db.createObjectStore('movimientos', { keyPath: 'id', autoIncrement: true });
			};
			pedido.onsuccess = () => { conexion = pedido.result; ok(conexion); };
			pedido.onerror = () => mal(pedido.error);
		});
	}

	/**
	 * Ejecuta una operación dentro de una transacción y espera a que termine
	 * de guardarse en disco (oncomplete), no solo a que se haya pedido.
	 */
	function operar(almacenes, modo, trabajo) {
		return abrir().then(db => new Promise((ok, mal) => {
			const tx = db.transaction(almacenes, modo);
			let resultado;
			Promise.resolve(trabajo(tx, valor => { resultado = valor; }))
				.catch(error => { tx.abort(); mal(error); });
			tx.oncomplete = () => ok(resultado);
			tx.onerror = () => mal(tx.error);
			tx.onabort = () => mal(tx.error || new Error('Operación cancelada'));
		}));
	}

	/** Convierte un pedido de IndexedDB en promesa (para usar dentro de una transacción) */
	function esperar(req) {
		return new Promise((ok, mal) => { req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error); });
	}

	const todos = almacen => operar(almacen, 'readonly', (tx, fin) =>
		esperar(tx.objectStore(almacen).getAll()).then(fin));

	const obtener = (almacen, clave) => operar(almacen, 'readonly', (tx, fin) =>
		esperar(tx.objectStore(almacen).get(clave)).then(fin));

	/** Inserta o actualiza. Devuelve la clave (el id nuevo si era un alta). */
	const guardar = (almacen, objeto) => operar(almacen, 'readwrite', (tx, fin) =>
		esperar(tx.objectStore(almacen).put(objeto)).then(fin));

	const borrar = (almacen, clave) => operar(almacen, 'readwrite', tx =>
		esperar(tx.objectStore(almacen).delete(clave)));

	/** Borra todo el almacén y carga la lista nueva, de una sola vez (o todo o nada) */
	const reemplazarTodo = (almacen, lista) => operar(almacen, 'readwrite', async tx => {
		const s = tx.objectStore(almacen);
		await esperar(s.clear());
		for (const objeto of lista) await esperar(s.put(objeto));
	});

	// --- Configuración: un valor por clave ---
	const leerConfig = clave => obtener('config', clave);
	const guardarConfig = (clave, valor) => operar('config', 'readwrite', tx =>
		esperar(tx.objectStore('config').put(valor, clave)));

	return { abrir, operar, esperar, todos, obtener, guardar, borrar, reemplazarTodo, leerConfig, guardarConfig };
})();
