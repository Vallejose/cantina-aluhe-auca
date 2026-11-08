/* Lista de pedidos del equipo: volver a ver ticket o comanda, y anular. */
const PantallaPedidos = {
	titulo: 'Pedidos',
	icono: '🧾',

	filtro: 'todos',  // todos | validos | anulados
	busqueda: '',

	async dibujar(c) {
		const todos = await Datos.listarPedidos();
		const anulados = todos.filter(p => p.anulado).length;

		c.innerHTML = `
			<header class="cabecera">
				<h1>Pedidos</h1>
				<input type="search" id="buscar" class="buscador" inputmode="numeric" placeholder="Buscar por número…" aria-label="Buscar por número" value="${Util.esc(this.busqueda)}">
			</header>
			<div class="chips" role="group" aria-label="Filtrar">
				<button class="chip" data-filtro="todos">Todos · ${todos.length}</button>
				<button class="chip" data-filtro="validos">Válidos · ${todos.length - anulados}</button>
				<button class="chip" data-filtro="anulados">Anulados · ${anulados}</button>
			</div>
			<div id="tabla"></div>`;

		const dibujarTabla = () => {
			c.querySelectorAll('[data-filtro]').forEach(b => b.classList.toggle('activo', b.dataset.filtro === this.filtro));
			const lista = todos.filter(p =>
				(this.filtro === 'todos' || (this.filtro === 'anulados') === p.anulado) &&
				(!this.busqueda.trim() || String(p.numero).includes(this.busqueda.trim())));

			const zona = c.querySelector('#tabla');
			if (todos.length === 0) {
				zona.innerHTML = `<div class="vacio"><div class="vacio-icono">🧾</div>
					<p><strong>Todavía no hay pedidos.</strong></p><p>Los pedidos aparecen acá cuando se cobran en <a href="#vender">Vender</a>.</p></div>`;
				return;
			}
			if (lista.length === 0) {
				zona.innerHTML = '<p class="ayuda">Ningún pedido coincide.</p>';
				return;
			}
			zona.innerHTML = `
				<div class="tarjeta sin-relleno">
					<table class="tabla">
						<thead><tr><th>N.º</th><th>Hora</th><th>Artículos</th><th>Medio de pago</th><th class="num">Total</th><th></th></tr></thead>
						<tbody>${lista.map(p => `
							<tr class="${p.anulado ? 'anulado' : ''}">
								<td><b class="tachable">${p.numero}</b></td>
								<td>${Util.hora(p.fecha)}</td>
								<td><span class="tachable">${Util.esc(Datos.resumenLineas(p))}</span>
									${p.anulado ? `<span class="etiqueta anulado">ANULADO ${Util.hora(p.anuladoEn)}</span>` : ''}</td>
								<td><span class="etiqueta ${p.medio.tipo}">${Util.esc(p.medio.nombre)}</span></td>
								<td class="num"><span class="tachable">${Util.dinero(p.cobrado)}</span></td>
								<td class="botones-fila">
									<button data-ticket="${p.numero}">Ticket</button>
									<button data-comanda="${p.numero}">Comanda</button>
									${p.anulado ? '' : `<button data-anular="${p.numero}" class="peligro">Anular</button>`}
								</td>
							</tr>`).join('')}
						</tbody>
					</table>
				</div>`;

			const porNumero = n => todos.find(p => p.numero === Number(n));
			zona.querySelectorAll('[data-ticket]').forEach(b => b.onclick = () => Documentos.mostrar(porNumero(b.dataset.ticket), 'ticket'));
			zona.querySelectorAll('[data-comanda]').forEach(b => b.onclick = () => Documentos.mostrar(porNumero(b.dataset.comanda), 'comanda'));
			zona.querySelectorAll('[data-anular]').forEach(b => b.onclick = () => this.anular(porNumero(b.dataset.anular)));
		};

		c.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { this.filtro = b.dataset.filtro; dibujarTabla(); });
		const buscar = c.querySelector('#buscar');
		buscar.oninput = () => { this.busqueda = buscar.value; dibujarTabla(); };
		dibujarTabla();
	},

	async anular(pedido) {
		const ok = await Util.confirmar(`¿Anular el pedido ${pedido.numero}?`,
			`${Util.dinero(pedido.cobrado)} en ${pedido.medio.nombre}. Queda en la lista como anulado y no suma en el cierre. No se puede deshacer.`,
			'Anular pedido');
		if (!ok) return;
		try {
			await Datos.anularPedido(pedido.numero);
			Util.avisar(`Pedido ${pedido.numero} anulado`);
			App.mostrar();
		} catch (error) {
			Util.avisar(error.message, 'error');
		}
	},
};
