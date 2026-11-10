/* Cierre: ventas, costo y ganancia de la caja, por medio de pago y por artículo. */
const PantallaCierre = {
	titulo: 'Cierre',
	icono: '📊',

	/** "pedido 8000" si hay uno solo; "pedidos 8000 a 8012" si hay varios */
	rangoPedidos(k) {
		return k.desdeNumero === k.hastaNumero
			? `pedido <b>${k.desdeNumero}</b>`
			: `pedidos <b>${k.desdeNumero}</b> a <b>${k.hastaNumero}</b>`;
	},

	/**
	 * Fechas compactas, sin el año:
	 *   mismo minuto  → 08/11 03:32
	 *   mismo día     → 08/11 de 18:00 a 23:40
	 *   días distintos → 08/11 18:00 a 09/11 01:20
	 */
	rangoFechas(desde, hasta) {
		const dia = iso => Util.fechaCorta(iso).split(' ')[0];
		if (Util.fechaCorta(desde) === Util.fechaCorta(hasta)) return `<b>${Util.fechaCorta(desde)}</b>`;
		if (dia(desde) === dia(hasta)) return `<b>${dia(desde)}</b> de <b>${Util.hora(desde)}</b> a <b>${Util.hora(hasta)}</b>`;
		return `<b>${Util.fechaCorta(desde)}</b> a <b>${Util.fechaCorta(hasta)}</b>`;
	},

	pestana: 'resumen', // resumen | exportaciones | cajas (solo en la laptop)

	async dibujar(c) {
		const k = await Datos.calcularCierre();
		if (!Impresion.estado) await Impresion.consultar();
		const laptop = !!Impresion.estado?.esLaptop;
		if (this.pestana === 'cajas' && !laptop) this.pestana = 'resumen';

		const rango = k.desdeNumero == null
			? 'Todavía no hay pedidos'
			: `Caja ${k.equipo}${k.prueba ? ' (prueba)' : ''} · ${this.rangoPedidos(k)} · ${this.rangoFechas(k.desdeFecha, k.hastaFecha)}`;

		c.innerHTML = `
			<header class="cabecera">
				<div><h1>Cierre</h1><span class="suave">${rango}</span></div>
			</header>
			<div class="pestanas" role="tablist" aria-label="Secciones del cierre">
				<button role="tab" id="tab-resumen" aria-controls="panel-cierre">Resumen</button>
				<button role="tab" id="tab-exportaciones" aria-controls="panel-cierre">Exportaciones</button>
				${laptop ? '<button role="tab" id="tab-cajas" aria-controls="panel-cierre">Todas las cajas</button>' : ''}
			</div>
			<div id="panel-cierre" role="tabpanel"></div>`;

		const mostrar = async () => {
			c.querySelectorAll('[role=tab]').forEach(t => t.setAttribute('aria-selected', t.id === 'tab-' + this.pestana));
			const panel = c.querySelector('#panel-cierre');
			if (this.pestana === 'resumen') await this.dibujarResumen(panel, k, laptop);
			else if (this.pestana === 'cajas') await this.dibujarCajas(panel, k);
			else await this.dibujarExportaciones(panel, k);
		};
		if (laptop) c.querySelector('#tab-cajas').onclick = () => { this.pestana = 'cajas'; mostrar(); };
		c.querySelector('#tab-resumen').onclick = () => { this.pestana = 'resumen'; mostrar(); };
		c.querySelector('#tab-exportaciones').onclick = () => { this.pestana = 'exportaciones'; mostrar(); };
		await mostrar();
	},

	// ---------------------------------------------------------------- Resumen

	async dibujarResumen(panel, k, laptop) {
		const d = Util.dinero;
		const servidor = Impresion.hayServidor();
		const envio = await Resumen.ultimoEnvio();
		const estadoEnvio = envio
			? `<span class="enviado">✓ Enviado a las ${Util.hora(envio.fecha)} (${envio.pedidos} ${envio.pedidos === 1 ? 'pedido' : 'pedidos'})</span>
				<small class="suave">Si vendés algo después, mandalo de nuevo: reemplaza al anterior.</small>`
			: '<small class="suave">Al final del día, para que la laptop sume todas las cajas.</small>';
		panel.innerHTML = `
			<div class="fin-del-dia">
				<div class="tarjeta">
					<h2>Esta caja</h2>
					<button id="imprimir-resumen" class="principal grande" ${servidor ? '' : 'disabled'}>Imprimir resumen de la caja</button>
					<small class="suave">Ventas por artículo y por medio de pago, con totales.</small>
				</div>
				<div class="tarjeta">
					<h2>Total de todas las cajas</h2>
					${laptop
						? `<button id="ver-cajas" class="oscuro grande">Ver todas las cajas</button>
							<small class="suave">Esta laptop se suma sola. Las tablets mandan lo suyo desde su Cierre.</small>`
						: `<button id="mandar" class="oscuro grande" ${servidor && k.pedidosValidos ? '' : 'disabled'}>Mandar a la laptop</button>${estadoEnvio}`}
				</div>
			</div>
			${servidor ? '' : '<p class="ayuda">Esta caja no está conectada a la laptop: no se puede imprimir ni mandar.</p>'}
			<div class="indicadores">
				<div class="indicador"><span>Ventas</span><b>${d(k.ventas)}</b><small>${k.pedidosValidos} pedidos válidos</small></div>
				<div class="indicador"><span>Costo</span><b>${d(k.costo)}</b><small>incluye lo entregado sin cargo</small></div>
				<div class="indicador destacado"><span>Ganancia</span><b>${d(k.ganancia)}</b><small>${k.margen} % de las ventas</small></div>
				<div class="indicador"><span>Anulados</span><b>${k.anulados.cantidad}</b><small>${d(k.anulados.monto)}, no suman</small></div>
			</div>

			<div class="columnas">
				<section class="columna-lateral">
					<h2 class="subtitulo">Por medio de pago</h2>
					<div class="tarjeta sin-relleno">
						<table class="tabla">
							<thead><tr><th>Medio</th><th class="num">Pedidos</th><th class="num">Monto</th></tr></thead>
							<tbody>${k.porMedio.map(m => `
								<tr><td>${Util.esc(m.nombre)}${m.tipo === 'sincargo'
									? `<br><span class="suave">${k.sinCargo.productos} productos · costo ${d(k.sinCargo.costo)}</span>` : ''}</td>
									<td class="num">${m.pedidos}</td><td class="num">${d(m.monto)}</td></tr>`).join('')
								|| '<tr><td colspan="3" class="suave">Sin ventas</td></tr>'}
							</tbody>
							<tfoot><tr><td>Total</td><td class="num">${k.pedidosValidos}</td><td class="num">${d(k.ventas)}</td></tr></tfoot>
						</table>
					</div>

					<h2 class="subtitulo">Arqueo de efectivo</h2>
					<div class="tarjeta sin-relleno">
						<table class="tabla">
							<tbody>
								<tr><td>Entradas de caja</td><td class="num">${d(k.caja.fondo)}</td></tr>
								<tr><td>+ Ventas en efectivo</td><td class="num">${d(k.caja.ventasEfectivo)}</td></tr>
								<tr><td>− Salidas de caja (${k.caja.cantidadRetiros})</td><td class="num">${d(k.caja.retiros)}</td></tr>
							</tbody>
							<tfoot><tr><td>Debería haber en caja</td><td class="num">${d(k.caja.esperado)}</td></tr></tfoot>
						</table>
					</div>
				</section>

				<section class="ancho">
					<h2 class="subtitulo">Por artículo</h2>
					<div class="tarjeta sin-relleno">
						<table class="tabla">
							<thead><tr><th>Artículo</th><th class="num">Cantidad</th><th class="num">Ventas</th><th class="num">Costo</th><th class="num">Ganancia</th></tr></thead>
							<tbody>${k.porArticulo.map(a => `
								<tr><td>${Util.esc(a.nombre)}</td>
									<td class="num">${a.cantidad}</td><td class="num">${d(a.ventas)}</td><td class="num">${d(a.costo)}</td>
									<td class="num ${a.ganancia < 0 ? 'negativo' : ''}">${d(a.ganancia)}</td></tr>`).join('')
								|| '<tr><td colspan="5" class="suave">Sin ventas</td></tr>'}
							</tbody>
							<tfoot><tr><td>Total</td><td class="num">${k.productos}</td><td class="num">${d(k.ventas)}</td><td class="num">${d(k.costo)}</td><td class="num">${d(k.ganancia)}</td></tr></tfoot>
						</table>
					</div>
					<p class="ayuda">Precio y costo son los del momento de cada venta: si un precio cambió durante el evento, el cierre no se altera.
						La cantidad incluye lo entregado sin cargo.</p>
				</section>
			</div>`;

		panel.querySelector('#imprimir-resumen').onclick = async ev => {
			const r = await this.conEspera(ev.target, () => Resumen.imprimir(Resumen.deCaja(k), `RESUMEN · CAJA ${k.equipo}`,
				k.desdeNumero == null ? 'Sin pedidos' : k.desdeNumero === k.hastaNumero ? `Pedido ${k.desdeNumero}` : `Pedidos ${k.desdeNumero} a ${k.hastaNumero}`));
			this.avisarImpresion(r, 'Resumen impreso');
		};
		const mandar = panel.querySelector('#mandar');
		if (mandar) mandar.onclick = async () => {
			const r = await this.conEspera(mandar, () => Resumen.mandar(Resumen.deCaja(k)));
			if (r.estado === 'recibido') { Util.avisar('La laptop recibió el resumen'); this.dibujarResumen(panel, k, laptop); }
			else Util.avisar(r.error || 'No se pudo mandar', 'error');
		};
		const ver = panel.querySelector('#ver-cajas');
		if (ver) ver.onclick = () => document.getElementById('tab-cajas').click();
	},

	/** Deshabilita el botón mientras trabaja */
	async conEspera(boton, tarea) {
		const texto = boton.textContent;
		boton.disabled = true;
		boton.textContent = 'Un momento…';
		try { return await tarea(); } finally { boton.disabled = false; boton.textContent = texto; }
	},

	avisarImpresion(r, textoOk) {
		if (r.estado === 'impreso') Util.avisar(textoOk);
		else if (r.estado === 'esperando') Util.avisar('En la fila de la impresora');
		else if (r.estado === 'sin-servidor') Util.avisar('Esta caja no está conectada a la laptop', 'error');
		else Util.avisar(r.error || 'No salió la impresión', 'error');
	},

	// ------------------------------------------- Todas las cajas (solo laptop)

	async dibujarCajas(panel, k) {
		const propio = Resumen.deCaja(k);
		// Las cajas de prueba se suman solo entre ellas, y las de venta solo entre ellas
		const recibidos = (await Resumen.recibidos())
			.filter(x => x.caja !== k.equipo && !!x.datos.prueba === !!k.prueba);
		const conectadas = (Impresion.estado?.cajas || [])
			.map(c => c.caja)
			.filter(n => n !== k.equipo && Datos.esPrueba(n) === !!k.prueba && !recibidos.some(x => x.caja === n));

		const total = Resumen.combinar([propio, ...recibidos.map(x => x.datos)]);
		const o = Resumen.ordenado(total);
		const nombresCajas = total.cajas.length === 1 ? `Caja ${total.cajas[0]}`
			: 'Cajas ' + total.cajas.slice(0, -1).join(', ') + ' y ' + total.cajas.at(-1);

		const tarjetaCaja = (n, texto, falta) => `
			<div class="tarjeta caja-conectada ${falta ? 'sin-senal' : ''}"><b>Caja ${n}</b><span>${texto}</span></div>`;

		panel.innerHTML = `
			<p class="ayuda sin-margen">Cada tablet manda lo suyo desde su Cierre con <b>Mandar a la laptop</b>. Esta laptop se suma sola.</p>
			<div class="grilla-cajas" style="margin: 14px 0">
				${tarjetaCaja(k.equipo, 'Esta laptop · al día')}
				${recibidos.map(x => tarjetaCaja(x.caja, `Recibida ${x.recibido} · ${x.datos.pedidos} pedidos`)).join('')}
				${conectadas.map(n => tarjetaCaja(n, 'Conectada, no mandó', true)).join('')}
			</div>
			<div class="indicadores">
				<div class="indicador destacado"><span>Total recaudado</span><b>${Util.dinero(o.totalMonto)}</b><small>${nombresCajas}</small></div>
				<div class="indicador"><span>Artículos vendidos</span><b>${o.totalArticulos}</b><small>${total.pedidos} pedidos</small></div>
			</div>
			<div class="acciones" style="margin-bottom: 8px">
				<button id="imprimir-total" class="principal grande" ${Impresion.hayServidor() ? '' : 'disabled'}>Imprimir total de las cajas</button>
				<button id="actualizar">Actualizar</button>
			</div>
			${conectadas.length ? `<p class="alerta" style="max-width: 640px">Falta${conectadas.length > 1 ? 'n' : ''} la${conectadas.length > 1 ? 's' : ''} caja${conectadas.length > 1 ? 's' : ''} ${conectadas.join(', ')}: si imprimís ahora, no ${conectadas.length > 1 ? 'las' : 'la'} incluye.</p>` : ''}
			<div class="columnas" style="margin-top: 16px">
				<section class="ancho">
					<h2 class="subtitulo">Por artículo</h2>
					<div class="tarjeta sin-relleno">
						<table class="tabla">
							<thead><tr><th>Artículo</th><th class="num">Cantidad</th></tr></thead>
							<tbody>${o.porArticulo.map(a => `<tr><td>${Util.esc(a.nombre)}</td><td class="num">${a.cantidad}</td></tr>`).join('') || '<tr><td colspan="2" class="suave">Sin ventas</td></tr>'}</tbody>
							<tfoot><tr><td>Total</td><td class="num">${o.totalArticulos}</td></tr></tfoot>
						</table>
					</div>
				</section>
				<section class="columna-lateral">
					<h2 class="subtitulo">Por medio de pago</h2>
					<div class="tarjeta sin-relleno">
						<table class="tabla">
							<thead><tr><th>Medio</th><th class="num">Monto</th></tr></thead>
							<tbody>${o.porMedio.map(m => `<tr><td>${Util.esc(m.nombre)}</td><td class="num">${Util.dinero(m.monto)}</td></tr>`).join('') || '<tr><td colspan="2" class="suave">Sin ventas</td></tr>'}</tbody>
							<tfoot><tr><td>Total</td><td class="num">${Util.dinero(o.totalMonto)}</td></tr></tfoot>
						</table>
					</div>
				</section>
			</div>`;

		panel.querySelector('#imprimir-total').onclick = async ev => {
			const r = await this.conEspera(ev.target, () => Resumen.imprimir(total, 'TOTAL DE LAS CAJAS', nombresCajas));
			this.avisarImpresion(r, 'Total de las cajas impreso');
		};
		panel.querySelector('#actualizar').onclick = () => this.dibujarCajas(panel, k);
	},

	// ----------------------------------------------------------- Exportaciones
	// Versión simple, sin filtros: exporta todo (sin los pedidos anulados).
	// La versión con filtros quedó guardada en borradores/exportaciones-con-filtros/.

	async dibujarExportaciones(panel, k) {
		const t = await Exportaciones.tablas();
		const archivo = (nombre, ext) => `${nombre}-caja${k.equipo}${k.prueba ? '-PRUEBA' : ''}-${Util.hoy()}.${ext}`;

		const CSV = [
			{ clave: 'ventasPorTicket', nombre: 'ventas-por-ticket', titulo: 'Tickets', icono: 'ticket' },
			{ clave: 'porMedio', nombre: 'por-medio-de-pago', titulo: 'Medios de pago', icono: 'medios' },
			{ clave: 'porArticulo', nombre: 'por-articulo', titulo: 'Artículos', icono: 'articulos' },
			{ clave: 'movimientos', nombre: 'movimientos', titulo: 'Movimientos', icono: 'movimientos' },
			{ clave: 'anulados', nombre: 'anulados', titulo: 'Anulados', icono: 'anulados' },
		];
		const JSON_ = [
			{ id: 'json-cierre', titulo: 'Cierre', icono: 'cierre' },
			{ id: 'json-carta', titulo: 'Carta', icono: 'carta' },
		];
		const cantidad = clave => t[clave].filas.length;

		panel.innerHTML = `
			<section class="tarjeta export-excel">
				<div class="export-icono grande">${this.svg('excel')}</div>
				<div class="export-texto">
					<h2>Excel de ventas</h2>
					<div class="pildoras"><span>Tickets</span><span>Medios de pago</span><span>Artículos</span></div>
				</div>
				<button class="principal grande" id="descargar-excel">${this.svg('descargar')} Descargar</button>
			</section>

			<details class="export-grupo">
				<summary><span class="export-formato">CSV</span> Tablas por separado</summary>
				<div class="export-mosaico">${CSV.map(x => `
					<button class="export-baldosa" data-csv="${x.clave}">
						<span class="export-icono">${this.svg(x.icono)}</span>
						<b>${x.titulo}</b>
						<span class="suave">${cantidad(x.clave)} fila${cantidad(x.clave) === 1 ? '' : 's'}</span>
					</button>`).join('')}
				</div>
			</details>

			<details class="export-grupo">
				<summary><span class="export-formato json">JSON</span> Datos completos</summary>
				<div class="export-mosaico">${JSON_.map(x => `
					<button class="export-baldosa" id="${x.id}">
						<span class="export-icono">${this.svg(x.icono)}</span>
						<b>${x.titulo}</b>
					</button>`).join('')}
				</div>
			</details>`;

		panel.querySelector('#descargar-excel').onclick = () => {
			Util.descargar(archivo('ventas', 'xlsx'), Exportaciones.excelVentas(t),
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			Util.avisar('Excel descargado');
		};
		panel.querySelectorAll('[data-csv]').forEach(b => b.onclick = () => {
			const x = CSV.find(y => y.clave === b.dataset.csv);
			Util.descargar(archivo(x.nombre, 'csv'), Exportaciones.csv(t[x.clave]), 'text/csv;charset=utf-8');
			Util.avisar(`${x.titulo} descargado`);
		});
		panel.querySelector('#json-cierre').onclick = async () => {
			Util.descargar(archivo('cierre', 'json'), await Datos.exportarCierre());
			Util.avisar('Cierre descargado');
		};
		panel.querySelector('#json-carta').onclick = async () => {
			Util.descargar(archivo('carta', 'json'), await Datos.exportarCarta());
			Util.avisar('Carta descargada');
		};
	},

	/** Íconos de trazo simple (SVG) para las exportaciones */
	svg(nombre) {
		const trazos = {
			excel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
			descargar: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
			ticket: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
			medios: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
			articulos: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>',
			movimientos: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
			anulados: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
			cierre: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
			carta: '<path d="M5 3h14v18H5z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
		};
		return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${trazos[nombre]}</svg>`;
	},
};
