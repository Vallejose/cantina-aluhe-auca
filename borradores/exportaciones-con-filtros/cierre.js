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

	pestana: 'resumen',                    // resumen | exportaciones
	filtros: null,                         // se conservan mientras la app está abierta

	async dibujar(c) {
		const k = await Datos.calcularCierre();

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
			</div>
			<div id="panel-cierre" role="tabpanel"></div>`;

		const mostrar = async () => {
			c.querySelectorAll('[role=tab]').forEach(t => t.setAttribute('aria-selected', t.id === 'tab-' + this.pestana));
			const panel = c.querySelector('#panel-cierre');
			if (this.pestana === 'resumen') this.dibujarResumen(panel, k);
			else await this.dibujarExportaciones(panel, k);
		};
		c.querySelector('#tab-resumen').onclick = () => { this.pestana = 'resumen'; mostrar(); };
		c.querySelector('#tab-exportaciones').onclick = () => { this.pestana = 'exportaciones'; mostrar(); };
		await mostrar();
	},

	// ---------------------------------------------------------------- Resumen

	dibujarResumen(panel, k) {
		const d = Util.dinero;
		panel.innerHTML = `
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
								<tr><td>Fondo de caja</td><td class="num">${d(k.caja.fondo)}</td></tr>
								<tr><td>+ Ventas en efectivo</td><td class="num">${d(k.caja.ventasEfectivo)}</td></tr>
								<tr><td>− Retiros (${k.caja.cantidadRetiros})</td><td class="num">${d(k.caja.retiros)}</td></tr>
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
								<tr><td>${Util.esc(a.nombre)}${a.sinCargo ? ` <span class="etiqueta sincargo">${a.sinCargo} sin cargo</span>` : ''}</td>
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
	},

	// ----------------------------------------------------------- Exportaciones

	async dibujarExportaciones(panel, k) {
		this.filtros ??= { ...Exportaciones.FILTROS_INICIALES };
		const f = this.filtros;
		const inicial = await Exportaciones.tablas(f);

		// Nombre de archivo: ventas-caja2-2026-11-08.xlsx (las cajas de prueba llevan -PRUEBA)
		const archivo = (nombre, ext) => `${nombre}-caja${k.equipo}${k.prueba ? '-PRUEBA' : ''}-${Util.hoy()}.${ext}`;

		const CSV = [
			{ clave: 'ventasPorTicket', nombre: 'ventas-por-ticket', descripcion: 'Una fila por ticket, con lo cobrado.' },
			{ clave: 'porMedio', nombre: 'por-medio-de-pago', descripcion: 'Pedidos y monto de cada medio de pago.' },
			{ clave: 'porArticulo', nombre: 'por-articulo', descripcion: 'Cuánto se vendió de cada artículo.' },
			{ clave: 'movimientos', nombre: 'movimientos', descripcion: 'Fondo de caja y retiros con su comprobante.' },
			{ clave: 'anulados', nombre: 'anulados', descripcion: 'Qué se anuló, cuándo y por cuánto.' },
		];
		const chips = tabla => tabla.columnas.map(c => `<span>${Util.esc(c.titulo)}</span>`).join('');

		panel.innerHTML = `
			<section class="tarjeta filtros">
				<div class="filtros-cabecera"><h2>Filtros</h2><button class="enlace" id="quitar-filtros">Quitar filtros</button></div>
				<div class="grilla-filtros">
					<label>Desde (fecha y hora)<input type="datetime-local" name="desde" value="${f.desde}"></label>
					<label>Hasta (fecha y hora)<input type="datetime-local" name="hasta" value="${f.hasta}"></label>
					<label>Desde el pedido<input name="numeroDesde" inputmode="numeric" value="${f.numeroDesde}" placeholder="${k.desdeNumero ?? ''}"></label>
					<label>Hasta el pedido<input name="numeroHasta" inputmode="numeric" value="${f.numeroHasta}" placeholder="${k.hastaNumero ?? ''}"></label>
					<label>Medio de pago<select name="medio">
						<option value="">Todos</option>
						${inicial.mediosDisponibles.map(m => `<option ${f.medio === m ? 'selected' : ''}>${Util.esc(m)}</option>`).join('')}
					</select></label>
					<label>Pedidos anulados<select name="anulados">
						<option value="no" ${f.anulados === 'no' ? 'selected' : ''}>No incluir</option>
						<option value="si" ${f.anulados === 'si' ? 'selected' : ''}>Incluir</option>
						<option value="solo" ${f.anulados === 'solo' ? 'selected' : ''}>Solo anulados</option>
					</select></label>
				</div>
				<div class="alerta" id="resumen-filtros"></div>
			</section>

			<section class="tarjeta exportacion-excel">
				<div class="excel-texto">
					<span class="etiqueta sincargo">EXCEL · 3 PESTAÑAS</span>
					<h2>Planilla de ventas (.xlsx)</h2>
					<p class="ayuda sin-margen">Un solo archivo de Excel con tres pestañas. Respeta los filtros.</p>
					<div class="pestanas-excel">
						<div><b>Ventas por ticket</b><div class="columnas-chips">${chips(inicial.ventasPorTicket)}</div></div>
						<div><b>Por medio de pago</b><div class="columnas-chips">${chips(inicial.porMedio)}<span>+ Total</span></div></div>
						<div><b>Por artículo</b><div class="columnas-chips">${chips(inicial.porArticulo)}<span>+ Total</span></div></div>
					</div>
				</div>
				<div class="excel-accion">
					<button class="principal grande" id="descargar-excel">Descargar Excel</button>
					<span class="nombre-archivo">${archivo('ventas', 'xlsx')}</span>
				</div>
			</section>

			<details class="tarjeta sin-relleno lista-csv">
				<summary>Tablas por separado (CSV) <span class="suave">· una tabla por archivo, respetan los filtros</span></summary>
				${CSV.map(x => `
					<div class="fila-csv">
						<div class="fila-csv-texto">
							<b>${Util.esc(inicial[x.clave].nombre)}</b>
							<span class="ayuda sin-margen">${x.descripcion}</span>
							<div class="columnas-chips">${chips(inicial[x.clave])}</div>
						</div>
						<span class="nombre-archivo">${archivo(x.nombre, 'csv')}</span>
						<button data-csv="${x.clave}">Descargar CSV</button>
					</div>`).join('')}
			</details>

			<h2 class="subtitulo">Datos (JSON) <span class="suave">· siempre completos, sin filtros</span></h2>
			<div class="grilla-json">
				<div class="tarjeta">
					<h3>Cierre para consolidar</h3>
					<p class="ayuda sin-margen">Resumen y detalle de toda la caja, para juntar después todas las cajas. Incluye costo y ganancia.</p>
					<div class="pie-json"><span class="nombre-archivo">${archivo('cierre', 'json')}</span><button id="json-cierre">Descargar JSON</button></div>
				</div>
				<div class="tarjeta">
					<h3>Carta</h3>
					<p class="ayuda sin-margen">Artículos y medios de pago, para cargar en otras cajas.</p>
					<div class="pie-json"><span class="nombre-archivo">${archivo('carta', 'json')}</span><button id="json-carta">Descargar JSON</button></div>
				</div>
			</div>
			<p class="ayuda">CSV: separado por “;” y con coma decimal, listo para Excel en español. Costo y ganancia no salen en las planillas, solo en el JSON para consolidar.</p>`;

		// --- Filtros: se aplican al escribir, y el aviso dice cuánto se va a exportar
		const leerFiltros = () => {
			panel.querySelectorAll('.grilla-filtros [name]').forEach(campo => { f[campo.name] = campo.value.trim(); });
		};
		const actualizarResumen = async () => {
			const aviso = panel.querySelector('#resumen-filtros');
			const numeroInvalido = ['numeroDesde', 'numeroHasta'].some(n => f[n] !== '' && !/^\d+$/.test(f[n]));
			if (numeroInvalido) {
				aviso.className = 'alerta peligro';
				aviso.textContent = 'Los números de pedido tienen que ser números enteros (ej.: 2000).';
				return;
			}
			const t = await Exportaciones.tablas(f);
			aviso.className = 'alerta';
			aviso.innerHTML = `Con estos filtros se exportan <b>${t.cantidadPedidos}</b> pedido${t.cantidadPedidos === 1 ? '' : 's'} y
				<b>${t.cantidadMovimientos}</b> movimiento${t.cantidadMovimientos === 1 ? '' : 's'} de efectivo.`;
		};
		panel.querySelectorAll('.grilla-filtros [name]').forEach(campo => {
			campo.oninput = campo.onchange = () => { leerFiltros(); actualizarResumen(); };
		});
		panel.querySelector('#quitar-filtros').onclick = () => {
			this.filtros = { ...Exportaciones.FILTROS_INICIALES };
			this.dibujarExportaciones(panel, k);
		};
		actualizarResumen();

		// --- Descargas
		const tablasActuales = async () => {
			leerFiltros();
			if (['numeroDesde', 'numeroHasta'].some(n => f[n] !== '' && !/^\d+$/.test(f[n]))) {
				Util.avisar('Revisá los números de pedido en los filtros', 'error');
				return null;
			}
			return Exportaciones.tablas(f);
		};

		panel.querySelector('#descargar-excel').onclick = async () => {
			const t = await tablasActuales();
			if (!t) return;
			Util.descargar(archivo('ventas', 'xlsx'), Exportaciones.excelVentas(t),
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			Util.avisar('Excel descargado');
		};
		panel.querySelectorAll('[data-csv]').forEach(b => b.onclick = async () => {
			const t = await tablasActuales();
			if (!t) return;
			const x = CSV.find(y => y.clave === b.dataset.csv);
			Util.descargar(archivo(x.nombre, 'csv'), Exportaciones.csv(t[x.clave]), 'text/csv;charset=utf-8');
			Util.avisar(`${t[x.clave].nombre} descargado`);
		});
		panel.querySelector('#json-cierre').onclick = async () => {
			Util.descargar(archivo('cierre', 'json'), await Datos.exportarCierre());
			Util.avisar('Cierre exportado');
		};
		panel.querySelector('#json-carta').onclick = async () => {
			Util.descargar(archivo('carta', 'json'), await Datos.exportarCarta());
			Util.avisar('Carta exportada');
		};
	},
};
