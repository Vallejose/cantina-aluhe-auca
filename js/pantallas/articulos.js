const PantallaArticulos = {
	titulo: 'Artículos',
	icono: '🍔',

	async dibujar(c) {
		const lista = await Datos.listarArticulos();

		// Agrupados por categoría, en el mismo orden en que se ven al vender
		const grupos = {};
		lista.forEach(a => (grupos[a.categoria] ??= []).push(a));

		const filas = Object.entries(grupos).map(([categoria, articulos]) => `
			<tr class="fila-grupo"><td colspan="6">${Util.esc(categoria)}</td></tr>
			${articulos.map(a => `
				<tr class="${a.activo ? '' : 'inactivo'}">
					<td>${Util.esc(a.nombre)}${a.activo ? '' : ' <span class="etiqueta">oculto</span>'}</td>
					<td class="num">${Util.dinero(a.precio)}</td>
					<td class="num">${Util.dinero(a.costo)}</td>
					<td class="num ${a.precio - a.costo < 0 ? 'negativo' : ''}">${Util.dinero(a.precio - a.costo)}</td>
					<td class="num">${a.precio ? Math.round((a.precio - a.costo) * 100 / a.precio) + ' %' : ''}</td>
					<td class="botones-fila">
						<button data-editar="${a.id}">Editar</button>
						<button data-alternar="${a.id}">${a.activo ? 'Ocultar' : 'Mostrar'}</button>
						<button data-borrar="${a.id}" class="peligro">Borrar</button>
					</td>
				</tr>`).join('')}`).join('');

		c.innerHTML = `
			<header class="cabecera">
				<h1>Artículos</h1>
				<div class="acciones">
					<button id="importar">Importar carta</button>
					<button id="exportar" ${lista.length ? '' : 'disabled'}>Exportar carta</button>
					<button id="nuevo" class="principal">+ Nuevo artículo</button>
				</div>
			</header>
			${lista.length === 0 ? `
				<div class="vacio">
					<div class="vacio-icono">🍔</div>
					<p><strong>Todavía no hay artículos.</strong></p>
					<p>Cargalos con <em>+ Nuevo artículo</em>, o si otro equipo ya tiene la carta armada, usá <em>Importar carta</em>.</p>
				</div>` : `
				<div class="tarjeta sin-relleno">
					<table class="tabla">
						<thead><tr><th>Artículo</th><th class="num">Precio</th><th class="num">Costo</th><th class="num">Ganancia</th><th class="num">Margen</th><th></th></tr></thead>
						<tbody>${filas}</tbody>
					</table>
				</div>
				<p class="ayuda">"Ocultar" saca el artículo de la pantalla de venta sin borrarlo. Cambiar un precio no modifica las ventas ya hechas.</p>`}`;

		const porId = id => lista.find(a => a.id === Number(id));

		c.querySelector('#nuevo').onclick = () => this.formulario();
		c.querySelector('#exportar').onclick = () => this.exportar();
		c.querySelector('#importar').onclick = () => this.importar();

		c.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => this.formulario(porId(b.dataset.editar)));

		c.querySelectorAll('[data-alternar]').forEach(b => b.onclick = async () => {
			const a = porId(b.dataset.alternar);
			await Datos.guardarArticulo({ ...a, activo: !a.activo });
			App.mostrar();
		});

		c.querySelectorAll('[data-borrar]').forEach(b => b.onclick = async () => {
			const a = porId(b.dataset.borrar);
			if (!(await Util.confirmar('Borrar artículo', `¿Borrar "${a.nombre}"? Las ventas ya hechas no cambian.`, 'Borrar'))) return;
			await Datos.borrarArticulo(a.id);
			Util.avisar('Artículo borrado');
			App.mostrar();
		});
	},

	/** Alta (sin artículo) o modificación (con artículo) */
	async formulario(articulo = null) {
		const cats = await Datos.categorias();
		const v = articulo || { nombre: '', categoria: cats[0] || '', precio: null, costo: null };

		Util.modal(articulo ? 'Modificar artículo' : 'Nuevo artículo', `
			<form class="formulario" onsubmit="return false">
				<label>Nombre * <input name="nombre" maxlength="40" value="${Util.esc(v.nombre)}" required></label>
				<label>Categoría * <small>(agrupa los botones al vender)</small>
					<input name="categoria" list="lista-categorias" maxlength="25" value="${Util.esc(v.categoria)}" placeholder="Ej.: Comidas, Bebidas">
					<datalist id="lista-categorias">${cats.map(x => `<option value="${Util.esc(x)}">`).join('')}</datalist>
				</label>
				<div class="dos-columnas">
					<label>Precio de venta * <input name="precio" inputmode="decimal" value="${Util.dineroParaCampo(v.precio)}" placeholder="0,00" required></label>
					<label>Costo <small>(opcional)</small> <input name="costo" inputmode="decimal" value="${Util.dineroParaCampo(v.costo)}" placeholder="0,00"></label>
				</div>
				<p class="ayuda sin-margen">* Obligatorio. Si no ponés el costo, queda en $ 0,00 (la ganancia sería todo el precio).</p>
				<p class="ayuda sin-margen" id="ganancia-previa"></p>
			</form>`, [
			{ texto: 'Cancelar' },
			{
				texto: 'Guardar', clase: 'principal', accion: async capa => {
					const f = capa.querySelector('form');
					try {
						const precio = Util.leerDinero(f.precio.value);
						// Costo vacío = 0; si escribieron algo, tiene que ser un monto válido
						const costo = f.costo.value.trim() === '' ? 0 : Util.leerDinero(f.costo.value);
						if (precio == null) throw new Error('Revisá el precio de venta (ej.: 120 o 120,50)');
						if (costo == null) throw new Error('Revisá el costo (ej.: 45 o 45,50), o dejalo vacío');
						await Datos.guardarArticulo({ ...articulo, nombre: f.nombre.value, categoria: f.categoria.value, precio, costo });
						Util.avisar(articulo ? 'Artículo modificado' : 'Artículo agregado');
						App.mostrar();
					} catch (error) {
						Util.avisar(error.message, 'error');
						return false; // deja la ventana abierta para corregir
					}
				},
			},
		]);

		// Muestra la ganancia mientras se escribe
		const f = document.querySelector('#modal form');
		const previa = document.getElementById('ganancia-previa');
		const actualizar = () => {
			const p = Util.leerDinero(f.precio.value);
			const k = f.costo.value.trim() === '' ? 0 : Util.leerDinero(f.costo.value);
			previa.textContent = p != null && k != null ? `Ganancia por unidad: ${Util.dinero(p - k)}` : '';
		};
		f.precio.oninput = f.costo.oninput = actualizar;
		actualizar();
	},

	async exportar() {
		const cfg = await Datos.configuracion();
		Util.descargar(`carta-equipo${cfg.equipo}-${Util.hoy()}.json`, await Datos.exportarCarta());
		Util.avisar('Carta exportada');
	},

	async importar() {
		const texto = await Util.elegirArchivo('.json,application/json');
		if (texto == null) return;
		try {
			const carta = Datos.leerCarta(texto);
			const ok = await Util.confirmar('Importar carta',
				`El archivo tiene ${carta.articulos.length} artículos y ${carta.mediosPago.length} medios de pago. ` +
				'Van a reemplazar la carta y los medios de pago de este equipo. Las ventas no se tocan.', 'Importar');
			if (!ok) return;
			await Datos.importarCarta(carta);
			Util.avisar('Carta importada');
			App.mostrar();
		} catch (error) {
			Util.avisar(error.message, 'error');
		}
	},
};
