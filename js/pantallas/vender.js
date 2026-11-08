/*
 * Tomar un pedido: carta a la izquierda, pedido en curso a la derecha.
 *
 * El pedido en curso vive en memoria (this.lineas) hasta que se cobra. Recién
 * al confirmar el cobro se numera y se guarda.
 */
const PantallaVender = {
	titulo: 'Vender',
	icono: '🛒',
	completa: true, // ocupa toda la altura, sin márgenes

	lineas: [],        // [{ articuloId, cantidad, observacion }]
	categoria: null,   // null = todas
	busqueda: '',
	confirmado: null,  // pedido recién cobrado: se muestra su ticket y comanda

	async dibujar(c) {
		this.cfg = await Datos.configuracion();
		if (this.confirmado) return this.dibujarConfirmado(c);

		this.articulos = (await Datos.listarArticulos()).filter(a => a.activo);
		this.numeracion = await Datos.estadoNumeracion();

		// Si mientras tanto se ocultó o borró un artículo, sale del pedido en curso
		this.lineas = this.lineas.filter(l => this.articulo(l.articuloId));

		c.innerHTML = `
			<div class="venta">
				<section class="venta-carta">
					<header class="cabecera">
						<h1>Nuevo pedido</h1>
						<input type="search" id="buscar" class="buscador" placeholder="Buscar artículo…" aria-label="Buscar artículo" value="${Util.esc(this.busqueda)}">
					</header>
					<div class="chips" id="chips" role="group" aria-label="Categorías"></div>
					<div id="grilla"></div>
				</section>
				<aside class="venta-pedido" id="panel" aria-label="Pedido en curso"></aside>
			</div>`;

		if (this.articulos.length === 0) {
			c.querySelector('#grilla').innerHTML = `
				<div class="vacio"><div class="vacio-icono">🍔</div>
				<p><strong>No hay artículos para vender.</strong></p>
				<p>Cargalos en <a href="#articulos">Artículos</a>.</p></div>`;
		}

		const buscar = c.querySelector('#buscar');
		buscar.oninput = () => { this.busqueda = buscar.value; this.dibujarCarta(); };

		this.dibujarCarta();
		this.dibujarPanel();
	},

	articulo(id) {
		return this.articulos.find(a => a.id === id);
	},

	cantidadDe(id) {
		return this.lineas.find(l => l.articuloId === id)?.cantidad || 0;
	},

	// ------------------------------------------------------------- La carta

	dibujarCarta() {
		const c = document.getElementById('contenido');
		const categorias = [...new Set(this.articulos.map(a => a.categoria))];
		if (this.categoria && !categorias.includes(this.categoria)) this.categoria = null;

		c.querySelector('#chips').innerHTML = [null, ...categorias].map(cat => `
			<button class="chip ${this.categoria === cat ? 'activo' : ''}" data-categoria="${Util.esc(cat ?? '')}">${Util.esc(cat ?? 'Todas')}</button>`).join('');
		c.querySelectorAll('[data-categoria]').forEach(b => b.onclick = () => {
			this.categoria = b.dataset.categoria || null;
			this.dibujarCarta();
		});

		if (this.articulos.length === 0) return;

		// Búsqueda sin distinguir mayúsculas ni tildes
		const normalizar = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
		const texto = normalizar(this.busqueda.trim());
		const visibles = this.articulos.filter(a =>
			(!this.categoria || a.categoria === this.categoria) && (!texto || normalizar(a.nombre).includes(texto)));

		const grupos = {};
		visibles.forEach(a => (grupos[a.categoria] ??= []).push(a));

		const grilla = c.querySelector('#grilla');
		grilla.innerHTML = visibles.length === 0
			? `<p class="ayuda">Ningún artículo coincide con “${Util.esc(this.busqueda)}”.</p>`
			: Object.entries(grupos).map(([cat, lista]) => `
				<h2 class="titulo-grupo">${Util.esc(cat)}</h2>
				<div class="grilla-articulos">${lista.map(a => this.botonArticulo(a)).join('')}</div>`).join('');

		grilla.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => this.agregar(Number(b.dataset.agregar)));
	},

	botonArticulo(a) {
		const cantidad = this.cantidadDe(a.id);
		return `
			<button class="articulo ${cantidad ? 'en-pedido' : ''}" data-agregar="${a.id}">
				<b>${Util.esc(a.nombre)}</b>
				<span>${Util.dinero(a.precio)}</span>
				${cantidad ? `<span class="contador" aria-label="${cantidad} en el pedido">${cantidad}</span>` : ''}
			</button>`;
	},

	/** Actualiza solo los contadores de la carta, sin redibujarla (no pierde el foco del buscador) */
	actualizarContadores() {
		document.querySelectorAll('[data-agregar]').forEach(b => {
			const a = this.articulo(Number(b.dataset.agregar));
			b.outerHTML = this.botonArticulo(a);
		});
		document.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => this.agregar(Number(b.dataset.agregar)));
	},

	// ------------------------------------------------------- El pedido en curso

	agregar(id) {
		const linea = this.lineas.find(l => l.articuloId === id);
		if (linea) linea.cantidad++;
		else this.lineas.push({ articuloId: id, cantidad: 1, observacion: '' });
		this.cambio();
	},

	cambiarCantidad(id, delta) {
		const linea = this.lineas.find(l => l.articuloId === id);
		if (!linea) return;
		linea.cantidad += delta;
		if (linea.cantidad <= 0) this.lineas = this.lineas.filter(l => l !== linea);
		this.cambio();
	},

	cambio() {
		this.dibujarPanel();
		this.actualizarContadores();
	},

	total() {
		return this.lineas.reduce((s, l) => s + this.articulo(l.articuloId).precio * l.cantidad, 0);
	},

	dibujarPanel() {
		const panel = document.getElementById('panel');
		const n = this.numeracion;
		const agotado = n.restantes === 0;

		const aviso = agotado
			? `<div class="alerta peligro">Esta caja usó todos sus números (hasta el ${n.hasta}). No se pueden hacer más pedidos.</div>`
			: n.restantes <= Datos.AVISO_NUMERACION
				? `<div class="alerta">Quedan ${n.restantes} números en esta caja (hasta el ${n.hasta}).</div>`
				: '';

		const lineas = this.lineas.map(l => {
			const a = this.articulo(l.articuloId);
			return `
				<div class="linea">
					<div class="linea-arriba"><b>${Util.esc(a.nombre)}</b><span class="monto">${Util.dinero(a.precio * l.cantidad)}</span></div>
					<div class="linea-controles">
						<button class="cuadrado" data-menos="${a.id}" aria-label="Uno menos de ${Util.esc(a.nombre)}">−</button>
						<b class="cantidad">${l.cantidad}</b>
						<button class="cuadrado" data-mas="${a.id}" aria-label="Uno más de ${Util.esc(a.nombre)}">+</button>
						<span class="suave">× ${Util.dinero(a.precio)}</span>
						${l.observacion ? '' : `<button class="enlace" data-obs="${a.id}">+ Observación</button>`}
					</div>
					${l.observacion ? `<button class="observacion" data-obs="${a.id}" title="Cambiar la observación">Obs.: ${Util.esc(l.observacion)}</button>` : ''}
				</div>`;
		}).join('');

		panel.innerHTML = `
			<div class="panel-cabecera">
				<h2>Pedido</h2>
				<span class="suave">próximo N.º <b class="numero">${agotado ? '—' : n.proximo}</b></span>
			</div>
			${aviso}
			<div class="lineas">${lineas || '<p class="ayuda centro">Tocá un artículo para agregarlo.</p>'}</div>
			<div class="panel-total"><span>Total</span><b>${Util.dinero(this.total())}</b></div>
			<div class="panel-botones">
				<button id="vaciar" class="peligro" ${this.lineas.length ? '' : 'disabled'}>Vaciar</button>
				<button id="cobrar" class="principal cobrar" ${this.lineas.length && !agotado ? '' : 'disabled'}>Cobrar</button>
			</div>`;

		panel.querySelectorAll('[data-menos]').forEach(b => b.onclick = () => this.cambiarCantidad(Number(b.dataset.menos), -1));
		panel.querySelectorAll('[data-mas]').forEach(b => b.onclick = () => this.cambiarCantidad(Number(b.dataset.mas), 1));
		panel.querySelectorAll('[data-obs]').forEach(b => b.onclick = () => this.editarObservacion(Number(b.dataset.obs)));
		panel.querySelector('#vaciar').onclick = async () => {
			if (!(await Util.confirmar('Vaciar pedido', '¿Sacar todos los artículos del pedido en curso?', 'Vaciar'))) return;
			this.lineas = [];
			this.cambio();
		};
		panel.querySelector('#cobrar').onclick = () => this.cobrar();
	},

	editarObservacion(id) {
		const linea = this.lineas.find(l => l.articuloId === id);
		const a = this.articulo(id);
		Util.modal(`Observación · ${a.nombre}`, `
			<form class="formulario" onsubmit="return false">
				<label>Para la cocina <small>(sale en la comanda)</small>
					<input name="obs" maxlength="80" value="${Util.esc(linea.observacion)}" placeholder="Ej.: uno sin chimichurri">
				</label>
			</form>`, [
			{ texto: 'Quitar', clase: 'peligro', accion: () => { linea.observacion = ''; this.dibujarPanel(); } },
			{ texto: 'Guardar', clase: 'principal', accion: capa => { linea.observacion = capa.querySelector('input').value.trim(); this.dibujarPanel(); } },
		]);
		const campo = document.querySelector('#modal input');
		campo.onkeydown = e => { if (e.key === 'Enter') document.querySelector('#modal .ventana-botones .principal').click(); };
	},

	// ----------------------------------------------------------------- Cobrar

	async cobrar() {
		const medios = (await Datos.listarMedios()).filter(m => m.activo);
		if (medios.length === 0) return Util.avisar('No hay medios de pago. Cargalos en Medios de pago.', 'error');

		const total = this.total();
		let elegido = (medios.find(m => m.tipo === 'efectivo') || medios[0]).id;

		// Montos rápidos: justo, el próximo múltiplo de 100 y billetes comunes
		const sugeridos = [...new Set([Math.ceil(total / 10000) * 10000, 50000, 100000, 200000])]
			.filter(m => m > total).slice(0, 3);

		const capa = Util.modal('Cobrar pedido', `
			<div class="cobro-total"><span>Total a cobrar</span><b>${Util.dinero(total)}</b></div>
			<fieldset>
				<legend>Medio de pago</legend>
				<div class="grilla-medios">${medios.map(m => `
					<button type="button" class="medio" data-medio="${m.id}">${Util.esc(m.nombre)}
						<span>${m.tipo === 'efectivo' ? 'calcula vuelto' : m.tipo === 'sincargo' ? 'no suma dinero' : '&nbsp;'}</span>
					</button>`).join('')}
				</div>
			</fieldset>
			<div id="zona-efectivo" class="zona-efectivo">
				<label class="formulario">Paga con <small>(vacío = justo)</small>
					<input id="paga-con" inputmode="decimal" placeholder="${Util.dineroParaCampo(total)}" autocomplete="off">
				</label>
				<div class="vuelto"><span>Vuelto</span><b id="vuelto">$ 0,00</b></div>
				<div class="acciones montos-rapidos">
					<button type="button" data-monto="">Justo</button>
					${sugeridos.map(m => `<button type="button" data-monto="${m}">${Util.dinero(m).replace(',00', '')}</button>`).join('')}
				</div>
			</div>`, [
			{ texto: 'Volver al pedido' },
			{
				texto: 'Confirmar y generar ticket', clase: 'principal', accion: async () => {
					const medio = medios.find(m => m.id === elegido);
					let pagaCon = null;
					if (medio.tipo === 'efectivo') {
						const texto = campo.value.trim();
						pagaCon = texto === '' ? total : Util.leerDinero(texto);
						if (pagaCon == null) { Util.avisar('Revisá el monto con que paga', 'error'); return false; }
						if (pagaCon < total) { Util.avisar('El monto con que paga no alcanza', 'error'); return false; }
					}
					try {
						const pedido = await Datos.confirmarPedido({
							lineas: this.lineas.map(l => ({ ...l })), medioId: elegido, pagaCon,
						});
						this.lineas = [];
						this.busqueda = '';
						this.confirmado = pedido;
						App.mostrar();
					} catch (error) {
						Util.avisar(error.message, 'error');
						return false;
					}
				},
			},
		]);
		capa.querySelector('.ventana').classList.add('ancha');

		const campo = capa.querySelector('#paga-con');
		const zona = capa.querySelector('#zona-efectivo');
		const vuelto = capa.querySelector('#vuelto');

		const actualizar = () => {
			capa.querySelectorAll('[data-medio]').forEach(b => {
				const activo = Number(b.dataset.medio) === elegido;
				b.classList.toggle('elegido', activo);
				b.setAttribute('aria-pressed', activo);
			});
			const efectivo = medios.find(m => m.id === elegido).tipo === 'efectivo';
			zona.classList.toggle('oculto', !efectivo);
			const paga = campo.value.trim() === '' ? total : Util.leerDinero(campo.value);
			const falta = paga != null && paga < total;
			vuelto.textContent = paga == null ? '—' : falta ? 'Falta ' + Util.dinero(total - paga) : Util.dinero(paga - total);
			vuelto.parentElement.classList.toggle('falta', paga == null || falta);
		};

		capa.querySelectorAll('[data-medio]').forEach(b => b.onclick = () => { elegido = Number(b.dataset.medio); actualizar(); });
		capa.querySelectorAll('[data-monto]').forEach(b => b.onclick = () => {
			campo.value = b.dataset.monto ? Util.dineroParaCampo(Number(b.dataset.monto)) : '';
			actualizar();
		});
		campo.oninput = actualizar;
		campo.onkeydown = e => { if (e.key === 'Enter') capa.querySelector('.ventana-botones .principal').click(); };
		actualizar();
		campo.focus();
	},

	// -------------------------------------------------- Pedido recién cobrado

	dibujarConfirmado(c) {
		const p = this.confirmado;
		let detalle = Util.esc(p.medio.nombre);
		if (p.medio.tipo === 'efectivo') detalle = `Efectivo · paga con ${Util.dinero(p.pagaCon)} · vuelto <b>${Util.dinero(p.vuelto)}</b>`;
		if (p.medio.tipo === 'sincargo') detalle = 'Sin cargo · no suma dinero';

		c.innerHTML = `
			<div class="confirmado">
				<div class="barra-confirmado">
					<div>
						<b class="titulo">Pedido ${p.numero} confirmado</b>
						<span>Total ${Util.dinero(p.total)} · ${detalle}</span>
					</div>
					<div class="acciones">
						<button disabled title="La impresión se agrega más adelante">Imprimir (más adelante)</button>
						<button id="nuevo-pedido" class="principal grande">Nuevo pedido</button>
					</div>
				</div>
				<div class="papeles">
					<section><h2 class="titulo-grupo">Ticket · para el cliente</h2>${Documentos.ticket(p, this.cfg)}</section>
					<section><h2 class="titulo-grupo">Comanda · para la cocina</h2>${Documentos.comanda(p)}</section>
				</div>
			</div>`;

		const nuevo = c.querySelector('#nuevo-pedido');
		nuevo.onclick = () => { this.confirmado = null; App.mostrar(); };
		nuevo.focus();
	},
};
