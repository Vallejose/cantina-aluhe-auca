const PantallaMedios = {
	titulo: 'Medios de pago',
	icono: '💳',

	async dibujar(c) {
		const lista = await Datos.listarMedios();

		c.innerHTML = `
			<header class="cabecera">
				<h1>Medios de pago</h1>
				<div class="acciones"><button id="nuevo" class="principal">+ Nuevo medio de pago</button></div>
			</header>
			<div class="tarjeta sin-relleno">
				<table class="tabla">
					<thead><tr><th>Medio de pago</th><th>Tipo</th><th></th></tr></thead>
					<tbody>${lista.map(m => `
						<tr class="${m.activo ? '' : 'inactivo'}">
							<td>${Util.esc(m.nombre)}${m.activo ? '' : ' <span class="etiqueta">oculto</span>'}</td>
							<td><span class="etiqueta ${m.tipo}">${Datos.TIPOS_MEDIO[m.tipo]}</span></td>
							<td class="botones-fila">
								<button data-editar="${m.id}">Editar</button>
								<button data-alternar="${m.id}">${m.activo ? 'Ocultar' : 'Mostrar'}</button>
								<button data-borrar="${m.id}" class="peligro">Borrar</button>
							</td>
						</tr>`).join('')}
					</tbody>
				</table>
			</div>
			<p class="ayuda">
				<strong>Efectivo</strong> pide con cuánto paga y calcula el vuelto, y es el que cuenta para el arqueo de caja.
				<strong>Sin cargo</strong> registra los productos entregados pero no suma dinero.
				Los cambios no modifican las ventas ya hechas.
			</p>`;

		const porId = id => lista.find(m => m.id === Number(id));

		c.querySelector('#nuevo').onclick = () => this.formulario();
		c.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => this.formulario(porId(b.dataset.editar)));

		c.querySelectorAll('[data-alternar]').forEach(b => b.onclick = async () => {
			const m = porId(b.dataset.alternar);
			await Datos.guardarMedio({ ...m, activo: !m.activo });
			App.mostrar();
		});

		c.querySelectorAll('[data-borrar]').forEach(b => b.onclick = async () => {
			const m = porId(b.dataset.borrar);
			if (!(await Util.confirmar('Borrar medio de pago', `¿Borrar "${m.nombre}"? Las ventas ya hechas no cambian.`, 'Borrar'))) return;
			await Datos.borrarMedio(m.id);
			Util.avisar('Medio de pago borrado');
			App.mostrar();
		});
	},

	formulario(medio = null) {
		const v = medio || { nombre: '', tipo: 'otro' };
		Util.modal(medio ? 'Modificar medio de pago' : 'Nuevo medio de pago', `
			<form class="formulario" onsubmit="return false">
				<label>Nombre <input name="nombre" maxlength="25" value="${Util.esc(v.nombre)}" placeholder="Ej.: Mercado Pago"></label>
				<label>Tipo
					<select name="tipo">${Object.entries(Datos.TIPOS_MEDIO).map(([clave, texto]) =>
						`<option value="${clave}" ${v.tipo === clave ? 'selected' : ''}>${texto}</option>`).join('')}
					</select>
				</label>
			</form>`, [
			{ texto: 'Cancelar' },
			{
				texto: 'Guardar', clase: 'principal', accion: async capa => {
					const f = capa.querySelector('form');
					try {
						await Datos.guardarMedio({ ...medio, nombre: f.nombre.value, tipo: f.tipo.value });
						Util.avisar(medio ? 'Medio de pago modificado' : 'Medio de pago agregado');
						App.mostrar();
					} catch (error) {
						Util.avisar(error.message, 'error');
						return false;
					}
				},
			},
		]);
	},
};
