/* Movimientos de efectivo: fondo de caja, retiros y lo que debería haber en la caja. */
const PantallaMovimientos = {
	titulo: 'Movimientos',
	icono: '💵',

	async dibujar(c) {
		const caja = await Datos.resumenCaja();
		const movimientos = await Datos.listarMovimientos();

		c.innerHTML = `
			<header class="cabecera">
				<h1>Movimientos</h1>
				<div class="acciones">
					<button id="fondo">Registrar fondo de caja</button>
					<button id="retiro" class="principal">Registrar retiro</button>
				</div>
			</header>

			<div class="indicadores">
				<div class="indicador"><span>Fondo de caja</span><b>${Util.dinero(caja.fondo)}</b></div>
				<div class="indicador"><span>+ Ventas en efectivo</span><b>${Util.dinero(caja.ventasEfectivo)}</b></div>
				<div class="indicador"><span>− Retiros (${caja.cantidadRetiros})</span><b class="negativo">${Util.dinero(caja.retiros)}</b></div>
				<div class="indicador destacado"><span>= Debería haber en caja</span><b>${Util.dinero(caja.esperado)}</b></div>
			</div>

			<h2 class="subtitulo">Movimientos</h2>
			${movimientos.length === 0 ? `
				<div class="tarjeta"><p class="ayuda sin-margen">Todavía no hay movimientos. Al empezar, registrá el <b>fondo de caja</b> (la plata para dar cambio).</p></div>` : `
				<div class="tarjeta sin-relleno">
					<table class="tabla">
						<thead><tr><th>Hora</th><th>Movimiento</th><th>Motivo</th><th class="num">Monto</th><th></th></tr></thead>
						<tbody>${movimientos.map(m => `
							<tr class="${m.anulado ? 'anulado' : ''}">
								<td>${Util.hora(m.fecha)}</td>
								<td><b class="tachable">${m.tipo === 'fondo' ? 'Fondo de caja' : 'Retiro ' + Util.esc(m.comprobante)}</b>
									${m.quien ? `<br><span class="suave">${m.tipo === 'retiro' ? 'Retiró' : 'Puso'}: ${Util.esc(m.quien)}</span>` : ''}
									${m.anulado ? `<span class="etiqueta anulado">ANULADO ${Util.hora(m.anuladoEn)}</span>` : ''}</td>
								<td class="tachable">${Util.esc(m.motivo) || '<span class="suave">—</span>'}</td>
								<td class="num tachable ${m.tipo === 'retiro' ? 'negativo' : ''}">${m.tipo === 'retiro' ? '− ' : '+ '}${Util.dinero(m.monto)}</td>
								<td class="botones-fila">
									${m.tipo === 'retiro' ? `<button data-comprobante="${m.id}">Comprobante</button>` : ''}
									${m.anulado ? '' : `<button data-anular="${m.id}" class="peligro">Anular</button>`}
								</td>
							</tr>`).join('')}
						</tbody>
					</table>
				</div>`}
			<p class="ayuda">Solo cuentan las ventas en efectivo; los pedidos anulados no suman.
				Para el arqueo, contá la plata de la caja y comparala con “Debería haber en caja”.</p>`;

		const porId = id => movimientos.find(m => m.id === Number(id));
		c.querySelector('#fondo').onclick = () => this.formulario('fondo', caja);
		c.querySelector('#retiro').onclick = () => this.formulario('retiro', caja);
		c.querySelectorAll('[data-comprobante]').forEach(b => b.onclick = () => Documentos.mostrarComprobante(porId(b.dataset.comprobante)));
		c.querySelectorAll('[data-anular]').forEach(b => b.onclick = async () => {
			const m = porId(b.dataset.anular);
			const nombre = m.tipo === 'fondo' ? 'el fondo de caja' : 'el retiro ' + m.comprobante;
			if (!(await Util.confirmar('Anular movimiento', `¿Anular ${nombre} de ${Util.dinero(m.monto)}? Queda tachado y no cuenta para la caja.`, 'Anular'))) return;
			await Datos.anularMovimiento(m.id);
			Util.avisar('Movimiento anulado');
			App.mostrar();
		});
	},

	formulario(tipo, caja) {
		const esRetiro = tipo === 'retiro';
		Util.modal(esRetiro ? 'Registrar retiro de efectivo' : 'Registrar fondo de caja', `
			<form class="formulario" onsubmit="return false">
				${esRetiro ? `<p class="ayuda sin-margen">Hay ${Util.dinero(caja.esperado)} en caja según el sistema.</p>` : ''}
				<label>Monto * <input name="monto" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
				<label>Motivo ${esRetiro ? '*' : '<small>(opcional)</small>'}
					<input name="motivo" maxlength="60" placeholder="${esRetiro ? 'Ej.: llevado a tesorería, compra de hielo' : 'Ej.: cambio para empezar'}">
				</label>
				<label>${esRetiro ? 'Quién retira' : 'Quién lo pone'} <small>(opcional)</small>
					<input name="quien" maxlength="40">
				</label>
			</form>`, [
			{ texto: 'Cancelar' },
			{
				texto: esRetiro ? 'Registrar y ver comprobante' : 'Registrar', clase: 'principal', accion: async capa => {
					const f = capa.querySelector('form');
					const monto = Util.leerDinero(f.monto.value);
					if (monto == null || monto <= 0) { Util.avisar('Revisá el monto (ej.: 2000 o 2.000,50)', 'error'); return false; }
					if (esRetiro && monto > caja.esperado &&
						!(await Util.confirmar('Retiro mayor que la caja', `Según el sistema hay ${Util.dinero(caja.esperado)} en caja. ¿Registrar igual el retiro de ${Util.dinero(monto)}?`, 'Registrar igual')))
						return true; // se cerró la confirmación; no se registra
					try {
						const m = await Datos.registrarMovimiento({ tipo, monto, motivo: f.motivo.value, quien: f.quien.value });
						Util.avisar(esRetiro ? `Retiro ${m.comprobante} registrado` : 'Fondo de caja registrado');
						await App.mostrar();
						if (esRetiro) await Documentos.mostrarComprobante(m);
					} catch (error) {
						Util.avisar(error.message, 'error');
						return false;
					}
				},
			},
		]);
	},
};
