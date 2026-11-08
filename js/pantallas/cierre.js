/* Cierre: ventas, costo y ganancia del equipo, por medio de pago y por artículo. */
const PantallaCierre = {
	titulo: 'Cierre',
	icono: '📊',

	async dibujar(c) {
		const k = await Datos.calcularCierre();
		const d = Util.dinero;

		const rango = k.desdeNumero == null
			? 'Todavía no hay pedidos'
			: `Equipo ${k.equipo}${k.prueba ? ' (prueba)' : ''} · pedidos ${k.desdeNumero} a ${k.hastaNumero} · ${Util.fechaHora(k.desdeFecha)} a ${Util.fechaHora(k.hastaFecha)}`;

		c.innerHTML = `
			<header class="cabecera">
				<div><h1>Cierre</h1><span class="suave">${rango}</span></div>
				<div class="acciones">
					<button id="csv" ${k.desdeNumero == null ? 'disabled' : ''}>Exportar a Excel (CSV)</button>
					<button id="exportar" class="principal">Exportar cierre para consolidar</button>
				</div>
			</header>

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

		const nombreArchivo = ext => `cierre-equipo${k.equipo}${k.prueba ? '-PRUEBA' : ''}-${Util.hoy()}.${ext}`;
		c.querySelector('#exportar').onclick = async () => {
			Util.descargar(nombreArchivo('json'), await Datos.exportarCierre());
			Util.avisar('Cierre exportado');
		};
		c.querySelector('#csv').onclick = async () => {
			Util.descargar(nombreArchivo('csv').replace('cierre', 'ventas'), await Datos.exportarCSV(), 'text/csv;charset=utf-8');
			Util.avisar('Detalle de ventas exportado');
		};
	},
};
