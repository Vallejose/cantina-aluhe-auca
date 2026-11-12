/*
 * Copia central en la laptop.
 *
 * Cada caja sigue guardando todo en su navegador (IndexedDB): es lo que manda.
 * Además, le pasa a la laptop una copia de sus pedidos y movimientos de caja,
 * que el servidor guarda en servidor/datos/caja-N.jsonl.
 *
 * Cómo sabe qué mandar, sin anotar nada en la caja:
 *   1. Le pide a la laptop las "firmas" de lo que ya tiene (GET api/central).
 *   2. Calcula la firma de cada pedido y movimiento propio (un resumen corto
 *      del registro: si se anula un pedido, su firma cambia).
 *   3. Manda solo lo que falta o cambió (POST api/central).
 * Si se corta la red, no se pierde nada: la próxima vez manda lo que falte.
 *
 * Se sincroniza al abrir la app, cada 15 segundos y enseguida después de
 * vender, anular o cargar un movimiento (Datos llama a Central.cambio()).
 *
 * Clave de cada registro: tipo + número (o id) + fecha de creación. Así, si una
 * caja se reinstala y repite números, no pisa en la laptop las ventas de antes.
 */
const Central = {

	CADA_MS: 15000,
	estado: { conectada: null, pendientes: null, ultimo: null, error: '' },
	trabajando: null,
	otraVez: false,

	iniciar() {
		this.sincronizar();
		setInterval(() => this.sincronizar(), this.CADA_MS);
	},

	/** Hubo una venta, anulación o movimiento: mandarlo ya */
	cambio() {
		setTimeout(() => this.sincronizar(), 0);
	},

	clavePedido: p => `p|${p.numero}|${p.fecha}`,
	claveMovimiento: m => `m|${m.id}|${m.fecha}`,

	/** Firma: largo + hash FNV-1a de 32 bits del registro en JSON */
	firma(texto) {
		let h = 0x811c9dc5;
		for (let i = 0; i < texto.length; i++) {
			h ^= texto.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		return texto.length.toString(36) + '-' + h.toString(36);
	},

	/** Todos los registros de esta caja, listos para mandar */
	async registrosPropios() {
		const pedidos = await DB.todos('pedidos');
		const movimientos = await DB.todos('movimientos');
		const armar = (tipo, clave, objeto) => {
			const json = JSON.stringify(objeto);
			return { clave, tipo, json, firma: this.firma(json) };
		};
		return [
			...pedidos.map(p => armar('pedido', this.clavePedido(p), p)),
			...movimientos.map(m => armar('movimiento', this.claveMovimiento(m), m)),
		];
	},

	/** Una sola sincronización a la vez; si piden otra mientras tanto, se hace al terminar */
	sincronizar() {
		if (this.trabajando) { this.otraVez = true; return this.trabajando; }
		this.trabajando = this.hacer().finally(() => {
			this.trabajando = null;
			if (this.otraVez) { this.otraVez = false; this.sincronizar(); }
		});
		return this.trabajando;
	},

	async hacer() {
		const caja = await DB.leerConfig('equipo');
		if (caja == null) return;
		const antes = JSON.stringify(this.estado);
		try {
			const r = await fetch(`api/central?caja=${caja}`, { cache: 'no-store' });
			// 404: la app no se abrió desde la laptop, o la laptop tiene el servidor viejo
			if (!r.ok) throw new Error(r.status === 404 ? 'sin-servidor' : 'La laptop no contestó bien');
			const { firmas } = await r.json();

			const faltan = (await this.registrosPropios()).filter(x => firmas[x.clave] !== x.firma);
			// De a tandas, para no mandar todo junto si hay muchos
			for (let i = 0; i < faltan.length; i += 200) {
				const tanda = faltan.slice(i, i + 200);
				const resp = await fetch(`api/central?caja=${caja}`, {
					method: 'POST', cache: 'no-store',
					headers: { 'Content-Type': 'text/plain; charset=utf-8' },
					body: tanda.map(x => `${x.clave}\t${x.firma}\t${x.tipo}\t${x.json}`).join('\n'),
				});
				if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'La laptop no guardó los datos');
			}
			this.estado = { conectada: true, pendientes: 0, ultimo: new Date().toISOString(), error: '' };
		} catch (e) {
			const pendientes = await this.contarPendientes();
			this.estado = {
				conectada: false, pendientes, ultimo: this.estado.ultimo,
				error: e.message === 'sin-servidor' ? '' : e.message,
				sinServidor: e.message === 'sin-servidor',
			};
		}
		if (JSON.stringify(this.estado) !== antes) this.dibujarIndicador();
	},

	/**
	 * Sin conexión no se sabe qué tiene la laptop: se cuentan los cambios
	 * hechos después de la última vez que se pudo sincronizar.
	 */
	async contarPendientes() {
		const desde = this.estado.ultimo;
		const pedidos = await DB.todos('pedidos');
		const movimientos = await DB.todos('movimientos');
		if (!desde) return pedidos.length + movimientos.length;
		const despues = f => f && f > desde;
		return pedidos.filter(p => despues(p.fecha) || despues(p.anuladoEn)).length
			+ movimientos.filter(m => despues(m.fecha) || despues(m.anuladoEn)).length;
	},

	// ----------------------------------------------------- Solo pruebas

	/** Al resetear una caja de prueba, también se aparta su copia en la laptop */
	async borrarCajaDePrueba(caja) {
		try {
			const r = await fetch(`api/central/borrar?caja=${caja}`, { method: 'POST', cache: 'no-store' });
			return r.ok;
		} catch {
			return false;
		}
	},

	// ------------------------------------------------- Para la laptop

	/**
	 * Lo que tiene la laptop de todas las cajas:
	 * [{ caja, ultimo, pedidos: [...], movimientos: [...] }]
	 */
	async todo() {
		try {
			const r = await fetch('api/central/todo', { cache: 'no-store' });
			if (!r.ok) return [];
			return (await r.json()).map(c => ({
				caja: c.caja,
				ultimo: c.ultimo,
				pedidos: c.registros.filter(x => x.tipo === 'pedido').map(x => x.datos),
				movimientos: c.registros.filter(x => x.tipo === 'movimiento').map(x => x.datos),
			}));
		} catch {
			return [];
		}
	},

	// ------------------------------------------------- Lo que se ve

	/** Una línea al pie del menú, debajo del indicador de la impresora */
	dibujarIndicador() {
		const zona = document.getElementById('indicador-central');
		if (!zona) return;
		const e = this.estado;
		if (e.conectada == null || e.sinServidor) { zona.innerHTML = ''; return; }
		const n = e.pendientes;
		const [clase, texto] = e.conectada
			? ['verde', 'Ventas copiadas en la laptop']
			: n ? ['rojo', `${n} ${n === 1 ? 'cambio' : 'cambios'} sin pasar a la laptop`]
				: ['amarillo', 'Sin conexión con la laptop'];
		zona.innerHTML = `<span class="punto ${clase}" aria-hidden="true"></span><span>${texto}</span>`;
		zona.title = e.error || (e.ultimo ? 'Última copia: ' + Util.hora(e.ultimo) : '');
	},
};
