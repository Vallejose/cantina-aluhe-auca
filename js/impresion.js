/*
 * Impresión a través de la laptop.
 *
 * Las cajas no hablan con la impresora: le mandan los bytes (js/escpos.js) al
 * servidor de la laptop (servidor/Cantina.java), que los imprime de a uno y en
 * orden, y aplica los interruptores Tickets y Comandas.
 *
 * Si la app no se abrió desde la laptop (por ejemplo, con otro servidor web),
 * no hay impresión: todo lo demás funciona igual y los papeles se ven en pantalla.
 */
const Impresion = {

	estado: null,       // última respuesta de /api/estado; null = todavía no se sabe
	CADA_MS: 5000,

	iniciar() {
		this.consultar();
		this.temporizador = setInterval(() => this.consultar(), this.CADA_MS);
	},

	/** ¿La app se abrió desde la laptop con el servidor de impresión? */
	hayServidor() {
		return !!this.estado?.servidor;
	},

	async consultar() {
		const cfg = await Datos.configuracion();
		try {
			const r = await fetch(`api/estado?caja=${cfg.equipo || 0}`, { cache: 'no-store' });
			this.estado = r.ok ? await r.json() : { servidor: false };
			// 404: la app se abrió con otro servidor web, sin impresión. No hace falta seguir preguntando.
			if (r.status === 404) clearInterval(this.temporizador);
		} catch {
			this.estado = { servidor: false, sinConexion: true };
		}
		this.dibujarIndicador();
		if (location.hash === '#impresion' && !document.querySelector('#modal:not(.oculto)'))
			PantallaImpresion.refrescar?.();
	},

	// ------------------------------------------------------------ Imprimir

	/**
	 * Manda un pedido a imprimir. `cuales`: ['ticket', 'comanda'] o uno solo.
	 * Con `reimpresion` sale aunque el interruptor esté apagado.
	 * Devuelve { estado: 'impreso' | 'omitido' | 'error' | 'esperando' | 'sin-servidor', impreso, omitido, error, id }
	 */
	async imprimirPedido(pedido, cfg, cuales = ['ticket', 'comanda'], reimpresion = false) {
		const partes = cuales.map(tipo => ({
			tipo, bytes: tipo === 'ticket' ? EscPos.ticket(pedido, cfg) : EscPos.comanda(pedido),
		}));
		const que = (cuales.length === 2 ? 'Ticket y comanda ' : cuales[0] === 'ticket' ? 'Ticket ' : 'Comanda ')
			+ pedido.numero + (reimpresion ? ' (reimpreso)' : '');
		return this.enviar(partes, { caja: pedido.equipo, que, reimpresion });
	},

	async imprimirPrueba() {
		const cfg = await Datos.configuracion();
		return this.enviar([{ tipo: 'prueba', bytes: EscPos.prueba(cfg, cfg.equipo) }], { caja: cfg.equipo, que: 'Hoja de prueba' });
	},

	async enviar(partes, { caja, que, reimpresion = false }) {
		if (!this.hayServidor()) await this.consultar();
		if (!this.hayServidor()) return { estado: 'sin-servidor' };

		const cuerpo = new Uint8Array(partes.reduce((s, p) => s + p.bytes.length, 0));
		let desde = 0;
		partes.forEach(p => { cuerpo.set(p.bytes, desde); desde += p.bytes.length; });

		const consulta = new URLSearchParams({ caja: caja || 0, que });
		if (reimpresion) consulta.set('reimpresion', '1');
		return this.pedir(`api/imprimir?${consulta}`, {
			method: 'POST',
			headers: { 'X-Partes': partes.map(p => `${p.tipo}:${p.bytes.length}`).join(','), 'Content-Type': 'application/octet-stream' },
			body: cuerpo,
		});
	},

	reintentar(id) {
		return this.pedir(`api/reintentar?id=${id}`, { method: 'POST' });
	},

	// ------------------------------------------- Solo desde la laptop

	async cambiarInterruptores(cambios) {
		const consulta = new URLSearchParams();
		for (const [clave, valor] of Object.entries(cambios)) consulta.set(clave, valor ? '1' : '0');
		return this.cambiar(`api/interruptores?${consulta}`);
	},

	cambiarImpresora(ip, puerto) {
		return this.cambiar(`api/impresora?${new URLSearchParams({ ip, puerto })}`);
	},

	async cambiar(url) {
		const r = await this.pedir(url, { method: 'POST' });
		if (r.servidor) { this.estado = r; this.dibujarIndicador(); }
		return r;
	},

	async pedir(url, opciones) {
		try {
			const r = await fetch(url, { cache: 'no-store', ...opciones });
			return await r.json();
		} catch {
			return { estado: 'error', error: 'No hay conexión con la laptop' };
		}
	},

	// ------------------------------------------------- Lo que se ve

	/** Cómo está la impresora, en pocas palabras: { clase, texto } */
	resumen() {
		const e = this.estado;
		if (!e) return { clase: 'gris', texto: 'Buscando impresora…' };
		if (!e.servidor) return { clase: 'gris', texto: e.sinConexion ? 'Sin conexión con la laptop' : 'Sin impresora' };
		if (!e.impresora.configurada) return { clase: 'amarillo', texto: 'Impresora sin configurar' };
		if (!e.impresora.conectada) return { clase: 'rojo', texto: 'Impresora sin conexión' };
		return { clase: 'verde', texto: 'Impresora lista' };
	},

	/** Indicador al pie del menú, en todas las pantallas */
	dibujarIndicador() {
		const zona = document.getElementById('indicador-impresora');
		if (!zona) return;
		const e = this.estado;
		const r = this.resumen();
		const chip = (nombre, si) => `<span class="chip-impresion ${si ? 'si' : 'no'}">${nombre} ${si ? 'sí' : 'no'}</span>`;
		zona.innerHTML = `
			<a href="#impresion" class="indicador-enlace">
				<span class="punto ${r.clase}" aria-hidden="true"></span><span>${r.texto}</span>
			</a>
			${e?.servidor ? `<div class="chips-impresion">${chip('Ticket', e.tickets)}${chip('Comanda', e.comandas)}</div>` : ''}`;
	},
};
