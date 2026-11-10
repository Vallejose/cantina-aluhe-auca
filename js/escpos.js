/*
 * Ticket y comanda en el idioma de la impresora térmica (ESC/POS), para papel
 * de 80 mm (48 letras por renglón). Es el mismo contenido que se ve en
 * pantalla (js/documentos.js), armado como bytes.
 *
 * Las tildes y la ñ se mandan en la tabla de caracteres PC850 (ESC t 2), que
 * entienden casi todas las impresoras ESC/POS. Si alguna letra sale mal en la
 * impresora real, se cambia TABLA y CODIGOS acá.
 */
const EscPos = (() => {

	const ANCHO = 48;   // letras por renglón en 80 mm con la letra normal
	const TABLA = 2;    // ESC t 2 = PC850 (multilingüe)

	// Letras que no son ASCII → su código en PC850
	const CODIGOS = {
		'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3,
		'Á': 0xB5, 'É': 0x90, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9,
		'ñ': 0xA4, 'Ñ': 0xA5, 'ü': 0x81, 'Ü': 0x9A,
		'¿': 0xA8, '¡': 0xAD, 'º': 0xA7, 'ª': 0xA6, '°': 0xF8, '·': 0xFA, '×': 0x9E,
	};
	// Las que no están en la tabla se cambian por algo parecido
	const PARECIDOS = { '−': '-', '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '»': '>', '«': '<', '€': 'E' };

	function codificar(texto) {
		const bytes = [];
		for (const letra of String(texto ?? '')) {
			const c = letra.codePointAt(0);
			if (c >= 0x20 && c < 0x7F) bytes.push(c);
			else if (CODIGOS[letra]) bytes.push(CODIGOS[letra]);
			else if (PARECIDOS[letra]) bytes.push(...codificar(PARECIDOS[letra]));
			else {
				// Saca la tilde (ç → c); si no queda nada conocido, un signo de pregunta
				const base = letra.normalize('NFD').replace(/[̀-ͯ]/g, '');
				bytes.push(base.length === 1 && base.charCodeAt(0) < 0x7F ? base.charCodeAt(0) : 0x3F);
			}
		}
		return bytes;
	}

	/** Corta un texto en renglones de `ancho` letras, sin partir palabras si se puede */
	function envolver(texto, ancho) {
		const renglones = [];
		let actual = '';
		for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
			let p = palabra;
			while (p.length > ancho) { // palabra más larga que el renglón
				if (actual) { renglones.push(actual); actual = ''; }
				renglones.push(p.slice(0, ancho));
				p = p.slice(ancho);
			}
			if (!actual) actual = p;
			else if (actual.length + 1 + p.length <= ancho) actual += ' ' + p;
			else { renglones.push(actual); actual = p; }
		}
		if (actual || renglones.length === 0) renglones.push(actual);
		return renglones;
	}

	/** Arma un papel de a renglones */
	class Papel {
		constructor() {
			this.b = [0x1B, 0x40, 0x1B, 0x74, TABLA]; // reiniciar la impresora y elegir la tabla
			this.ancho = ANCHO;
		}
		crudo(...bytes) { this.b.push(...bytes); return this; }
		texto(t) { this.b.push(...codificar(t)); return this; }
		linea(t = '') { return this.texto(t).crudo(0x0A); }
		centro() { return this.crudo(0x1B, 0x61, 1); }
		izquierda() { return this.crudo(0x1B, 0x61, 0); }
		negrita(si = true) { return this.crudo(0x1B, 0x45, si ? 1 : 0); }
		/** Tamaño de letra: 1 = normal, 2 = doble, … (ancho y alto) */
		tamano(ancho = 1, alto = ancho) {
			this.ancho = Math.floor(ANCHO / ancho);
			return this.crudo(0x1D, 0x21, ((ancho - 1) << 4) | (alto - 1));
		}
		separador() { return this.linea('-'.repeat(this.ancho)); }
		/** Texto que puede ocupar varios renglones */
		parrafo(t) { envolver(t, this.ancho).forEach(r => this.linea(r)); return this; }
		/** Texto a la izquierda y monto a la derecha; si no entra, el texto sigue abajo */
		fila(izq, der) {
			const lugar = this.ancho - der.length - 1;
			const renglones = envolver(izq, Math.max(lugar, 8));
			renglones.forEach((r, i) => {
				if (i < renglones.length - 1) this.linea(r);
				else this.linea(r.length <= lugar ? r.padEnd(this.ancho - der.length) + der : r + '\n' + der.padStart(this.ancho));
			});
			return this;
		}
		/** Avanza el papel y lo corta (corte parcial: queda unido de una punta) */
		cortar() { return this.crudo(0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x03); }
		bytes() { return new Uint8Array(this.b); }
	}

	const monto = c => Util.dinero(c).replace('$ ', '');
	const nombreCantina = cfg => (cfg.nombreCantina || Datos.NOMBRE_POR_DEFECTO).toUpperCase();

	function ticket(pedido, cfg) {
		const p = new Papel();
		p.centro().negrita().tamano(1, 2).parrafo(nombreCantina(cfg)).tamano(1).negrita(false);
		p.linea(`Caja ${pedido.equipo}`);
		if (pedido.prueba) p.negrita().linea('*** PRUEBA - NO VÁLIDO ***').negrita(false);
		p.separador();
		p.linea('PEDIDO N.º');
		p.negrita().tamano(3).linea(String(pedido.numero)).tamano(1).negrita(false);
		p.linea(Util.fechaHora(pedido.fecha));
		p.izquierda().separador();
		pedido.lineas.forEach(l => p.fila(`${l.cantidad} x ${l.nombre}`, monto(l.precio * l.cantidad)));
		p.separador();
		p.negrita().tamano(1, 2).fila('TOTAL', '$ ' + monto(pedido.total)).tamano(1).negrita(false);
		if (pedido.medio.tipo === 'efectivo') {
			p.fila('Efectivo, paga con', monto(pedido.pagaCon));
			p.fila('Vuelto', monto(pedido.vuelto));
		} else if (pedido.medio.tipo === 'sincargo') {
			p.fila('SIN CARGO', '0,00');
		} else {
			p.fila(pedido.medio.nombre, monto(pedido.cobrado));
		}
		if (cfg.pieTicket) p.separador().centro().parrafo(cfg.pieTicket);
		return p.cortar().bytes();
	}

	function comanda(pedido) {
		const p = new Papel();
		p.centro().negrita().tamano(2).linea('COMANDA').tamano(1);
		if (pedido.prueba) p.linea('*** PRUEBA ***');
		p.tamano(3).linea(String(pedido.numero)).tamano(1).negrita(false);
		p.linea(`${Util.fechaHora(pedido.fecha)} · Caja ${pedido.equipo}`);
		p.izquierda().separador();
		// Cantidades y artículos en letra doble, para leer de lejos en la cocina
		p.tamano(2);
		pedido.lineas.forEach(l => {
			p.negrita().parrafo(`${l.cantidad} ${l.nombre.toUpperCase()}`).negrita(false);
			if (l.observacion) p.parrafo('  > ' + l.observacion);
		});
		p.tamano(1).separador();
		const n = Datos.cantidadArticulos(pedido);
		p.centro().linea(`${n} ${n === 1 ? 'artículo' : 'artículos'}`);
		return p.cortar().bytes();
	}

	/** Comprobante de una entrada o salida de caja */
	function comprobante(m, cfg) {
		const p = new Papel();
		p.centro().negrita().parrafo(nombreCantina(cfg)).negrita(false);
		p.linea('COMPROBANTE');
		p.negrita().tamano(2).linea(m.tipo === 'fondo' ? 'ENTRADA' : 'SALIDA').tamano(1).linea('DE CAJA').negrita(false);
		if (m.prueba) p.negrita().linea('*** PRUEBA - NO VÁLIDO ***').negrita(false);
		if (m.comprobante) p.linea(`N.º ${m.comprobante}`);
		p.linea(`${Util.fechaHora(m.fecha)} · Caja ${m.equipo}`);
		p.izquierda().separador();
		p.negrita().tamano(1, 2).fila('MONTO', Util.dinero(m.monto)).tamano(1).negrita(false);
		if (m.motivo) p.parrafo('Motivo: ' + m.motivo);
		if (m.quien) p.parrafo((m.tipo === 'fondo' ? 'Puso: ' : 'Retiró: ') + m.quien);
		return p.cortar().bytes();
	}

	/**
	 * Resumen del día: ventas por artículo (cantidad) y por medio de pago (monto).
	 * `titulo`: "RESUMEN · CAJA 2" o "TOTAL DE LAS CAJAS"; `detalle`: renglón de abajo.
	 */
	function resumen(r, cfg, titulo, detalle) {
		const o = Resumen.ordenado(r);
		const p = new Papel();
		p.centro().negrita().parrafo(nombreCantina(cfg)).tamano(1, 2).parrafo(titulo).tamano(1).negrita(false);
		if (r.prueba) p.negrita().linea('*** PRUEBA ***').negrita(false);
		if (detalle) p.parrafo(detalle);
		p.linea(Util.fechaHora(new Date().toISOString()));
		p.izquierda().separador();

		p.negrita().linea('VENTAS POR ARTÍCULO').negrita(false);
		p.fila('Artículo', 'Cant.');
		o.porArticulo.forEach(a => p.fila(a.nombre, String(a.cantidad)));
		if (!o.porArticulo.length) p.linea('Sin ventas');
		p.linea('-'.repeat(ANCHO));
		p.negrita().fila('TOTAL', String(o.totalArticulos)).negrita(false);
		p.separador();

		p.negrita().linea('VENTAS POR MEDIO DE PAGO').negrita(false);
		p.fila('Medio', 'Monto');
		o.porMedio.forEach(m => p.fila(m.nombre, monto(m.monto)));
		if (!o.porMedio.length) p.linea('Sin ventas');
		p.linea('-'.repeat(ANCHO));
		p.negrita().tamano(1, 2).fila('TOTAL', '$ ' + monto(o.totalMonto)).tamano(1).negrita(false);
		return p.cortar().bytes();
	}

	/** Hoja de prueba: para ver tildes, ñ, tamaños y el corte */
	function prueba(cfg, caja) {
		const p = new Papel();
		p.centro().negrita().tamano(2).linea('PRUEBA').tamano(1).negrita(false);
		p.linea(nombreCantina(cfg));
		p.linea(`Desde la Caja ${caja} · ${Util.fechaHora(new Date().toISOString())}`);
		p.separador().izquierda();
		p.linea('Tildes: á é í ó ú  Á É Í Ó Ú');
		p.linea('Eñes:   ñ Ñ   ¿Pingüino? ¡Sí!   N.º 1');
		p.fila('Monto a la derecha', '1.250,50');
		p.linea('123456789012345678901234567890123456789012345678');
		p.negrita().linea('Letra en negrita').negrita(false);
		p.tamano(2).linea('Letra doble').tamano(1);
		p.separador().centro().linea('Si ves todo bien, la impresora está lista.');
		return p.cortar().bytes();
	}

	return { ANCHO, codificar, envolver, ticket, comanda, comprobante, resumen, prueba, Papel };
})();
