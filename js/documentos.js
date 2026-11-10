/*
 * Ticket y comanda. Se dibujan con el ancho de una impresora de tickets de
 * 80 mm, así cuando se agregue la impresión solo hay que mandarlos.
 *
 * El ticket es para el cliente (con precios). La comanda es para la cocina
 * (sin precios, cantidades grandes y observaciones). Llevan el mismo número.
 */
const Documentos = (() => {

	const montoSimple = c => Util.dinero(c).replace('$ ', '');

	function encabezado(cfg, pedido) {
		return `
			<div class="centro negrita">${Util.esc((cfg.nombreCantina || Datos.NOMBRE_POR_DEFECTO).toUpperCase())}</div>
			<div class="centro">Caja ${pedido.equipo}</div>
			${pedido.prueba ? '<div class="centro negrita">*** PRUEBA – NO VÁLIDO ***</div>' : ''}`;
	}

	function marcaAnulado(pedido) {
		return pedido.anulado
			? `<div class="sello-anulado">ANULADO ${Util.fechaHora(pedido.anuladoEn)}</div>`
			: '';
	}

	function ticket(pedido, cfg) {
		const lineas = pedido.lineas.map(l => `
			<div class="fila"><span>${l.cantidad} x ${Util.esc(l.nombre)}</span><span>${montoSimple(l.precio * l.cantidad)}</span></div>`).join('');

		let pago = `<div class="fila"><span>${Util.esc(pedido.medio.nombre)}</span><span>${montoSimple(pedido.cobrado)}</span></div>`;
		if (pedido.medio.tipo === 'efectivo')
			pago = `
				<div class="fila"><span>Efectivo, paga con</span><span>${montoSimple(pedido.pagaCon)}</span></div>
				<div class="fila"><span>Vuelto</span><span>${montoSimple(pedido.vuelto)}</span></div>`;
		if (pedido.medio.tipo === 'sincargo')
			pago = `<div class="fila"><span>SIN CARGO</span><span>0,00</span></div>`;

		return `
			<div class="papel">
				${marcaAnulado(pedido)}
				${encabezado(cfg, pedido)}
				<div class="corte"></div>
				<div class="centro">PEDIDO N.º</div>
				<div class="centro numero-grande">${pedido.numero}</div>
				<div class="centro">${Util.fechaHora(pedido.fecha)}</div>
				<div class="corte"></div>
				${lineas}
				<div class="corte"></div>
				<div class="fila negrita total"><span>TOTAL</span><span>$ ${montoSimple(pedido.total)}</span></div>
				${pago}
				${cfg.pieTicket ? `<div class="corte"></div><div class="centro">${Util.esc(cfg.pieTicket)}</div>` : ''}
			</div>`;
	}

	function comanda(pedido) {
		const lineas = pedido.lineas.map(l => `
			<div class="linea-comanda"><b>${l.cantidad}</b> ${Util.esc(l.nombre.toUpperCase())}</div>
			${l.observacion ? `<div class="obs-comanda">» ${Util.esc(l.observacion)}</div>` : ''}`).join('');

		return `
			<div class="papel">
				${marcaAnulado(pedido)}
				<div class="centro negrita">COMANDA</div>
				${pedido.prueba ? '<div class="centro negrita">*** PRUEBA ***</div>' : ''}
				<div class="centro numero-grande">${pedido.numero}</div>
				<div class="centro">${Util.fechaHora(pedido.fecha)} · Caja ${pedido.equipo}</div>
				<div class="corte"></div>
				${lineas}
				<div class="corte"></div>
				<div class="centro">${Datos.cantidadArticulos(pedido)} ${Datos.cantidadArticulos(pedido) === 1 ? 'artículo' : 'artículos'}</div>
			</div>`;
	}

	const nombreMovimiento = m => m.tipo === 'fondo' ? 'Entrada de caja' : 'Salida de caja';

	/** Comprobante de una entrada o salida de efectivo */
	function comprobante(m, cfg) {
		return `
			<div class="papel">
				${m.anulado ? `<div class="sello-anulado">ANULADO ${Util.fechaHora(m.anuladoEn)}</div>` : ''}
				<div class="centro negrita">${Util.esc((cfg.nombreCantina || Datos.NOMBRE_POR_DEFECTO).toUpperCase())}</div>
				<div class="centro">COMPROBANTE · ${nombreMovimiento(m).toUpperCase()}</div>
				${m.prueba ? '<div class="centro negrita">*** PRUEBA – NO VÁLIDO ***</div>' : ''}
				${m.comprobante ? `<div class="centro numero-mediano">N.º ${Util.esc(m.comprobante)}</div>` : ''}
				<div class="centro">${Util.fechaHora(m.fecha)} · Caja ${m.equipo}</div>
				<div class="corte"></div>
				<div class="fila negrita total"><span>MONTO</span><span>${Util.dinero(m.monto)}</span></div>
				${m.motivo ? `<div>Motivo: ${Util.esc(m.motivo)}</div>` : ''}
				${m.quien ? `<div>${m.tipo === 'fondo' ? 'Puso' : 'Retiró'}: ${Util.esc(m.quien)}</div>` : ''}
			</div>`;
	}

	async function mostrarComprobante(m) {
		const cfg = await Datos.configuracion();
		const botones = [{ texto: 'Cerrar', clase: 'principal' }];
		if (Impresion.hayServidor() && !m.anulado)
			botones.unshift({ texto: 'Imprimir', accion: async capa => { await imprimirComprobante(m, capa.querySelector('.ventana-botones button')); return false; } });
		Util.modal(`Comprobante ${m.comprobante || ''} · ${nombreMovimiento(m)}`, `<div class="papeles">${comprobante(m, cfg)}</div>`, botones);
	}

	/** Manda el comprobante a la impresora (sale siempre, no depende de los interruptores) */
	async function imprimirComprobante(m, boton) {
		const texto = boton?.textContent;
		if (boton) { boton.disabled = true; boton.textContent = 'Imprimiendo…'; }
		const cfg = await Datos.configuracion();
		const r = await Impresion.enviar([{ tipo: 'comprobante', bytes: EscPos.comprobante(m, cfg) }],
			{ caja: m.equipo, que: `Comprobante ${m.comprobante || ''} (${nombreMovimiento(m).toLowerCase()})` });
		if (boton) { boton.disabled = false; boton.textContent = texto; }
		if (r.estado === 'impreso') Util.avisar(`Comprobante ${m.comprobante || ''} impreso`);
		else if (r.estado === 'esperando') Util.avisar('En la fila de la impresora');
		else if (r.estado === 'sin-servidor') Util.avisar('Esta caja no está conectada a la laptop', 'error');
		else Util.avisar(r.error || 'No salió la impresión', 'error');
	}

	/** Ventana con el ticket o la comanda de un pedido ya hecho */
	async function mostrar(pedido, cual) {
		const cfg = await Datos.configuracion();
		const nombre = cual === 'ticket' ? 'Ticket' : 'Comanda';
		const botones = [{ texto: 'Cerrar', clase: 'principal' }];
		// Reimprimir: solo pedidos válidos y si la caja está conectada a la laptop.
		// Sale aunque el interruptor esté apagado (es un pedido a propósito).
		if (!pedido.anulado && Impresion.hayServidor())
			botones.unshift({
				texto: `Reimprimir ${nombre.toLowerCase()}`, accion: async capa => {
					const boton = capa.querySelector('.ventana-botones button');
					boton.disabled = true;
					boton.textContent = 'Imprimiendo…';
					const r = await Impresion.imprimirPedido(pedido, cfg, [cual], true);
					if (r.estado === 'impreso') Util.avisar(`${nombre} ${pedido.numero} impreso`);
					else if (r.estado === 'esperando') Util.avisar('En la fila de la impresora');
					else Util.avisar(r.error || 'No salió la impresión', 'error');
				},
			});
		Util.modal(`${nombre} del pedido ${pedido.numero}`,
			`<div class="papeles">${cual === 'ticket' ? ticket(pedido, cfg) : comanda(pedido)}</div>`, botones);
	}

	return { ticket, comanda, comprobante, mostrar, mostrarComprobante, imprimirComprobante, nombreMovimiento };
})();
