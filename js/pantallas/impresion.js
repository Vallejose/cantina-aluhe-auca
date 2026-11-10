/*
 * Ajustes › Impresión. En la laptop se prenden y apagan los tickets y las
 * comandas para todas las cajas, y se elige la dirección de la impresora.
 * En las tablets se ve lo mismo, pero sin poder cambiarlo.
 */
const PantallaImpresion = {
	titulo: 'Impresión',
	icono: '🖨️',

	async dibujar(c) {
		this.contenedor = c;
		if (!Impresion.estado) await Impresion.consultar();
		this.refrescar();
	},

	/** Se vuelve a dibujar cada vez que llega el estado de la laptop (cada 5 segundos) */
	refrescar() {
		const c = this.contenedor;
		if (!c || location.hash !== '#impresion') return;
		const e = Impresion.estado;

		if (!e?.servidor) {
			c.innerHTML = `
				<header class="cabecera"><h1>Impresión</h1></header>
				<div class="vacio">
					<div class="vacio-icono">🖨️</div>
					<p><strong>Esta caja no está conectada a la laptop.</strong></p>
					<p>Abrí la app desde la dirección que muestra la ventana del servidor en la laptop.<br>
					Mientras tanto se puede vender igual: el ticket y la comanda se ven en pantalla.</p>
				</div>`;
			return;
		}

		const laptop = e.esLaptop;
		const r = Impresion.resumen();
		const interruptor = (clave, nombre, detalle) => `
			<button class="interruptor ${e[clave] ? 'si' : ''}" data-interruptor="${clave}" aria-pressed="${e[clave]}" ${laptop ? '' : 'disabled'}>
				<span><b>${nombre}</b><small>${detalle}</small></span>
				<span class="pista" aria-hidden="true"><i></i></span>
			</button>`;

		const cajas = e.cajas.map(k => `
			<div class="tarjeta caja-conectada ${k.haceSeg > 30 ? 'sin-senal' : ''}">
				<b>Caja ${k.caja}</b>
				<span>${k.laptop ? 'Esta laptop' : 'Tablet'} · ${this.hace(k.haceSeg)}</span>
			</div>`).join('');

		const estados = { impreso: ['ok', 'Impreso'], error: ['mal', 'No salió'], esperando: ['', 'En espera'], omitido: ['', 'Apagado'], reintentado: ['', 'Salió al reintentar'] };
		const ultimas = e.ultimas.map(t => {
			const [clase, texto] = estados[t.estado] || ['', t.estado];
			return `
				<tr>
					<td>${Util.esc(t.hora)}</td>
					<td>${t.caja || '—'}</td>
					<td>${Util.esc(t.que)}</td>
					<td><span class="estado-fila ${clase}">${texto}</span>${t.error ? `<br><small class="suave">${Util.esc(t.error)}</small>` : ''}</td>
					<td class="botones-fila">${t.estado === 'error' ? `<button data-reintentar="${t.id}">Reintentar</button>` : ''}</td>
				</tr>`;
		}).join('');

		c.innerHTML = `
			<header class="cabecera">
				<h1>Impresión</h1>
				<span class="suave">${laptop ? 'Lo que elijas acá vale para todas las cajas' : 'Se cambia desde la laptop'}</span>
			</header>
			<div class="columnas">
				<div class="columna-lateral">
					${interruptor('tickets', 'Tickets', 'Para el cliente, con precios')}
					${interruptor('comandas', 'Comandas', 'Para la cocina, sin precios')}
					<p class="ayuda sin-margen">Quedan como los dejes, aunque apagues la laptop.${laptop ? '' : ' Las tablets solo los ven.'}</p>

					<div class="tarjeta">
						<div class="fila-impresora">
							<h2 class="sin-margen">Impresora</h2>
							<span class="estado-impresora"><span class="punto ${r.clase}" aria-hidden="true"></span>${r.texto.replace('Impresora ', '')}</span>
						</div>
						<dl class="datos-impresora">
							<dt>Dirección</dt><dd class="mono">${e.impresora.configurada ? Util.esc(e.impresora.ip) + (e.impresora.puerto !== 9100 ? ':' + e.impresora.puerto : '') : '—'}</dd>
							<dt>Papel</dt><dd>80 mm</dd>
							<dt>En espera</dt><dd>${e.enEspera}</dd>
						</dl>
						<div class="acciones">
							<button id="prueba" class="principal" ${e.impresora.configurada ? '' : 'disabled'}>Imprimir prueba</button>
							${laptop ? '<button id="direccion">Cambiar dirección</button>' : ''}
						</div>
					</div>
				</div>

				<div class="ancho">
					<h2 class="subtitulo" style="margin-top:0">Cajas conectadas</h2>
					<div class="grilla-cajas">${cajas || '<p class="ayuda">Todavía ninguna.</p>'}</div>
					<h2 class="subtitulo">Últimas impresiones</h2>
					${ultimas ? `
						<div class="tarjeta sin-relleno">
							<table class="tabla">
								<thead><tr><th>Hora</th><th>Caja</th><th>Qué</th><th>Estado</th><th></th></tr></thead>
								<tbody>${ultimas}</tbody>
							</table>
						</div>` : '<p class="ayuda">Todavía no se imprimió nada.</p>'}
				</div>
			</div>`;

		c.querySelectorAll('[data-interruptor]').forEach(b => b.onclick = async () => {
			const clave = b.dataset.interruptor;
			const r = await Impresion.cambiarInterruptores({ [clave]: !e[clave] });
			if (r.estado === 'error') Util.avisar(r.error, 'error');
			this.refrescar();
		});
		c.querySelectorAll('[data-reintentar]').forEach(b => b.onclick = async () => {
			b.disabled = true;
			b.textContent = 'Imprimiendo…';
			const r = await Impresion.reintentar(b.dataset.reintentar);
			Util.avisar(r.estado === 'impreso' ? 'Impreso' : r.error || 'No salió', r.estado === 'impreso' ? 'ok' : 'error');
			await Impresion.consultar();
		});
		c.querySelector('#prueba').onclick = async ev => {
			ev.target.disabled = true;
			ev.target.textContent = 'Imprimiendo…';
			const r = await Impresion.imprimirPrueba();
			Util.avisar(r.estado === 'impreso' ? 'Hoja de prueba impresa' : r.error || 'No salió', r.estado === 'impreso' ? 'ok' : 'error');
			await Impresion.consultar();
		};
		const direccion = c.querySelector('#direccion');
		if (direccion) direccion.onclick = () => this.cambiarDireccion();
	},

	hace(seg) {
		if (seg < 15) return 'ahora';
		if (seg < 60) return `hace ${seg} s`;
		return `hace ${Math.round(seg / 60)} min`;
	},

	cambiarDireccion() {
		const imp = Impresion.estado.impresora;
		Util.modal('Dirección de la impresora', `
			<form class="formulario" onsubmit="return false">
				<label>Dirección IP <small>(la que tiene fija en el router)</small>
					<input name="ip" inputmode="decimal" value="${Util.esc(imp.ip)}" placeholder="192.168.1.50" autocomplete="off">
				</label>
				<label>Puerto <small>(casi siempre 9100)</small>
					<input name="puerto" inputmode="numeric" value="${imp.puerto}" autocomplete="off">
				</label>
			</form>`, [
			{ texto: 'Cancelar' },
			{
				texto: 'Guardar', clase: 'principal', accion: async capa => {
					const ip = capa.querySelector('[name=ip]').value.trim();
					const puerto = Number(capa.querySelector('[name=puerto]').value.trim() || 9100);
					if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) { Util.avisar('Escribí la dirección así: 192.168.1.50', 'error'); return false; }
					if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) { Util.avisar('El puerto tiene que ser un número', 'error'); return false; }
					const r = await Impresion.cambiarImpresora(ip, puerto);
					if (r.estado === 'error') { Util.avisar(r.error, 'error'); return false; }
					Util.avisar(r.impresora.conectada ? 'Impresora conectada' : 'Guardado, pero la impresora no contesta', r.impresora.conectada ? 'ok' : 'error');
					setTimeout(() => this.refrescar());
				},
			},
		]);
	},
};
