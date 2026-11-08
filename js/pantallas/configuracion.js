const PantallaConfiguracion = {
	titulo: 'Configuración',
	icono: '⚙️',

	async dibujar(c) {
		const cfg = await Datos.configuracion();
		const primeraVez = cfg.equipo == null;
		const bloqueado = !primeraVez && (await Datos.hayVentas());
		let elegido = cfg.equipo;

		const boton = n => `
			<button type="button" class="equipo ${Datos.esPrueba(n) ? 'prueba' : ''} ${elegido === n ? 'elegido' : ''}"
				data-equipo="${n}" aria-pressed="${elegido === n}" ${bloqueado && elegido !== n ? 'disabled' : ''}>
				${n}<span>${Datos.esPrueba(n) ? 'prueba' : n * 1000}</span>
			</button>`;

		c.innerHTML = `
			<header class="cabecera">
				<div>
					${primeraVez ? '<span class="pastilla">Primera vez en este dispositivo</span>' : ''}
					<h1>${primeraVez ? 'Bienvenido: configurá este equipo' : 'Configuración del equipo'}</h1>
				</div>
			</header>

			<div class="columnas">
				<form class="tarjeta formulario ancho" id="form-config">
					<p class="ayuda sin-margen">Cada dispositivo que vende tiene que tener un número distinto. Se elige una sola vez.</p>

					<fieldset>
						<legend>Equipos de venta</legend>
						<div class="grilla-equipos">${Datos.EQUIPOS_VENTA.map(boton).join('')}</div>
					</fieldset>
					<fieldset>
						<legend>Equipos de prueba <small>· se pueden resetear</small></legend>
						<div class="grilla-equipos">${Datos.EQUIPOS_PRUEBA.map(boton).join('')}</div>
					</fieldset>

					<div class="resumen-equipo" id="resumen"></div>

					<div class="dos-columnas">
						<label>Nombre de la cantina <small>(sale en el ticket)</small>
							<input name="nombreCantina" maxlength="40" value="${Util.esc(cfg.nombreCantina || Datos.NOMBRE_POR_DEFECTO)}">
						</label>
						<label>Pie del ticket <small>(opcional)</small>
							<input name="pieTicket" maxlength="60" value="${Util.esc(cfg.pieTicket)}" placeholder="Ej.: ¡Gracias por colaborar!">
						</label>
					</div>

					<div class="acciones derecha">
						<button type="submit" class="principal grande" id="guardar"></button>
					</div>
				</form>

				<aside class="columna-lateral" id="lateral"></aside>
			</div>`;

		const form = c.querySelector('#form-config');

		const actualizar = () => {
			c.querySelectorAll('[data-equipo]').forEach(b => {
				const n = Number(b.dataset.equipo);
				b.classList.toggle('elegido', n === elegido);
				b.setAttribute('aria-pressed', n === elegido);
			});
			const resumen = c.querySelector('#resumen');
			const guardar = c.querySelector('#guardar');
			if (elegido == null) {
				resumen.innerHTML = 'Elegí un número de equipo.';
				guardar.textContent = 'Empezar';
				guardar.disabled = true;
				return;
			}
			const r = Datos.rangoNumeracion(elegido);
			resumen.innerHTML = `<b>Equipo ${elegido}${Datos.esPrueba(elegido) ? ' · prueba' : ''}</b>
				<span>numera sus pedidos del <b>${r.desde}</b> al <b>${r.hasta}</b>.
				${bloqueado ? 'Ya tiene ventas, así que no se puede cambiar.' : 'Después de la primera venta no se puede cambiar.'}</span>`;
			guardar.textContent = primeraVez ? `Empezar como Equipo ${elegido}` : 'Guardar';
			guardar.disabled = false;
		};

		c.querySelectorAll('[data-equipo]').forEach(b => b.onclick = () => {
			if (bloqueado) return;
			elegido = Number(b.dataset.equipo);
			actualizar();
		});
		actualizar();

		form.onsubmit = async e => {
			e.preventDefault();
			try {
				await Datos.guardarConfiguracion({
					equipo: elegido,
					nombreCantina: form.nombreCantina.value,
					pieTicket: form.pieTicket.value,
				});
				Util.avisar('Configuración guardada');
				// La primera vez sigue a cargar la carta (el cambio de dirección redibuja solo)
				if (primeraVez && location.hash !== '#articulos') { location.hash = '#articulos'; return; }
				await App.mostrar();
			} catch (error) {
				Util.avisar(error.message, 'error');
			}
		};

		await this.dibujarLateral(c.querySelector('#lateral'), cfg);
	},

	/** Ayuda para repartir números, y el reseteo si este es un equipo de prueba */
	async dibujarLateral(lateral, cfg) {
		let html = `
			<div class="tarjeta">
				<h2>Cómo repartir los números</h2>
				<ol class="lista">
					<li>Antes del evento, anotá qué dispositivo es cada equipo (por ejemplo: 1 = notebook de la caja principal).</li>
					<li>Pegale una etiqueta con su número a cada dispositivo.</li>
					<li>Al abrir la app por primera vez, elegí ese número.</li>
					<li>Los equipos 8 y 9 son solo para probar: sus ventas no cuentan.</li>
				</ol>
			</div>`;

		const ultimo = await Datos.ultimoRespaldo();
		html += `
			<div class="tarjeta">
				<h2>Respaldo de los datos</h2>
				<p class="ayuda sin-margen">Guarda en un archivo todo lo de este equipo: configuración, carta, pedidos y caja.
					Conviene hacerlo durante el evento, por si el navegador borra sus datos o el dispositivo falla.</p>
				<div class="acciones" style="margin-top: 12px">
					${cfg.equipo != null ? '<button id="respaldar" class="principal">Exportar respaldo completo</button>' : ''}
					<button id="restaurar">Restaurar desde respaldo</button>
				</div>
				${ultimo ? `<p class="suave sin-margen" style="margin-top: 10px">Último respaldo: ${Util.fechaHora(ultimo)}</p>` : ''}
			</div>`;

		if (cfg.prueba) {
			const datos = await Datos.contarDatosDePrueba();
			html += `
				<div class="tarjeta">
					<h2>Resetear equipo de prueba</h2>
					<p class="ayuda sin-margen">Borra ${datos.pedidos} pedido(s) y ${datos.movimientos} movimiento(s) de caja, y la numeración vuelve a ${cfg.equipo * 1000}. La carta y los medios de pago se mantienen.</p>
					<div class="acciones"><button id="resetear" class="peligro-lleno" ${datos.pedidos + datos.movimientos === 0 ? 'disabled' : ''}>Resetear Equipo ${cfg.equipo}</button></div>
				</div>`;
		}
		lateral.innerHTML = html;

		const botonReset = lateral.querySelector('#resetear');
		if (botonReset) botonReset.onclick = () => this.confirmarReseteo(cfg.equipo);

		const respaldar = lateral.querySelector('#respaldar');
		if (respaldar) respaldar.onclick = async () => {
			const texto = await Datos.exportarRespaldo();
			Util.descargar(`respaldo-equipo${cfg.equipo}${cfg.prueba ? '-PRUEBA' : ''}-${Util.hoy()}-${Util.hora(new Date().toISOString()).replace(':', '')}.json`, texto);
			Util.avisar('Respaldo exportado');
			App.mostrar();
		};
		lateral.querySelector('#restaurar').onclick = () => this.restaurar();
	},

	async restaurar() {
		const texto = await Util.elegirArchivo('.json,application/json');
		if (texto == null) return;
		try {
			const r = Datos.leerRespaldo(texto);
			const ok = await Util.confirmar('Restaurar respaldo',
				`Respaldo del Equipo ${r.config.equipo}, del ${Util.fechaHora(r.exportado)}: ${r.pedidos.length} pedidos, ` +
				`${r.movimientos.length} movimientos de caja y ${r.articulos.length} artículos. ` +
				'Reemplaza TODO lo que hay en este dispositivo.', 'Restaurar');
			if (!ok) return;
			await Datos.restaurarRespaldo(r);
			Util.avisar('Respaldo restaurado');
			location.hash = '#vender';
			App.mostrar();
		} catch (error) {
			Util.avisar(error.message, 'error');
		}
	},

	confirmarReseteo(equipo) {
		Util.modal(`¿Resetear el Equipo ${equipo}?`, `
			<p>Se borran los pedidos y los movimientos de caja de este equipo de prueba. No se puede deshacer.</p>
			<label class="formulario">Para confirmar escribí <b>RESETEAR</b><input id="confirmacion" autocomplete="off"></label>`, [
			{ texto: 'Cancelar' },
			{
				texto: 'Resetear', clase: 'peligro', accion: async capa => {
					if (capa.querySelector('#confirmacion').value.trim().toUpperCase() !== 'RESETEAR') {
						Util.avisar('Escribí RESETEAR para confirmar', 'error');
						return false;
					}
					await Datos.resetearEquipoDePrueba();
					Util.avisar(`Equipo ${equipo} reseteado`);
					App.mostrar();
				},
			},
		]);
	},
};
