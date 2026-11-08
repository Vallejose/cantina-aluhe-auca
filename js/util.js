/*
 * Utilidades que usan todas las pantallas.
 *
 * DINERO: todos los montos se guardan en CENTÉSIMOS y como número entero
 * ($ 120,50 se guarda como 12050). Así las sumas nunca tienen errores de
 * redondeo, que con decimales en JavaScript sí aparecen (0.1 + 0.2 = 0.30000000000000004).
 */
const Util = (() => {

	const formateador = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	/** 12050 -> "$ 120,50" */
	function dinero(centesimos) {
		const c = centesimos || 0;
		return (c < 0 ? '−$ ' : '$ ') + formateador.format(Math.abs(c) / 100);
	}

	/** 12050 -> "120,50" (para mostrar dentro de un campo de texto) */
	function dineroParaCampo(centesimos) {
		return centesimos == null ? '' : formateador.format(centesimos / 100).replace(/\./g, '');
	}

	/**
	 * Lee lo que escribió el usuario y lo pasa a centésimos.
	 * Acepta "120", "120,5", "120,50", "120.50" y "1.250,50".
	 * Devuelve null si no es un monto válido.
	 */
	function leerDinero(texto) {
		let t = String(texto ?? '').trim().replace(/\$/g, '').replace(/\s/g, '');
		if (t === '') return null;
		if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
		if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
		return Math.round(parseFloat(t) * 100);
	}

	/** Evita que un nombre con < o & rompa el HTML */
	function esc(texto) {
		return String(texto ?? '').replace(/[&<>"']/g, c =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	}

	const dos = n => String(n).padStart(2, '0');

	/** "07/11/2026 21:47" (24 horas) */
	function fechaHora(iso) {
		const d = new Date(iso);
		return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${hora(iso)}`;
	}

	/** "21:47" */
	function hora(iso) {
		const d = new Date(iso);
		return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
	}

	/** Aviso corto abajo de la pantalla, que se va solo */
	let temporizador;
	function avisar(texto, tipo = 'ok') {
		const caja = document.getElementById('aviso');
		caja.textContent = texto;
		caja.className = 'aviso ' + tipo;
		clearTimeout(temporizador);
		temporizador = setTimeout(() => caja.classList.add('oculto'), 2600);
	}

	/**
	 * Ventana emergente. `cuerpo` es HTML. `botones` es una lista de
	 * { texto, clase, accion }; si la accion devuelve false, la ventana no se cierra.
	 */
	function modal(titulo, cuerpo, botones) {
		const capa = document.getElementById('modal');
		capa.innerHTML = `
			<div class="ventana" role="dialog" aria-modal="true">
				<h2>${esc(titulo)}</h2>
				<div class="ventana-cuerpo">${cuerpo}</div>
				<div class="ventana-botones"></div>
			</div>`;
		const zona = capa.querySelector('.ventana-botones');
		const ventana = capa.querySelector('.ventana');
		botones.forEach(b => {
			const boton = document.createElement('button');
			boton.textContent = b.texto;
			boton.className = b.clase || '';
			boton.onclick = async () => {
				const resultado = b.accion ? await b.accion(capa) : true;
				// Si la acción abrió otra ventana (por ejemplo un comprobante), esa queda abierta
				if (resultado !== false && capa.contains(ventana)) cerrarModal();
			};
			zona.appendChild(boton);
		});
		capa.classList.remove('oculto');
		const primerCampo = capa.querySelector('input, select');
		if (primerCampo) primerCampo.focus();
		return capa;
	}

	function cerrarModal() {
		const capa = document.getElementById('modal');
		capa.classList.add('oculto');
		capa.innerHTML = '';
	}

	/** Pregunta Sí / No. Devuelve una promesa con true o false. */
	function confirmar(titulo, texto, textoSi = 'Sí') {
		return new Promise(resolver => {
			modal(titulo, `<p>${esc(texto)}</p>`, [
				{ texto: 'Cancelar', accion: () => resolver(false) },
				{ texto: textoSi, clase: 'peligro', accion: () => resolver(true) },
			]);
		});
	}

	/** Descarga un texto como archivo */
	function descargar(nombreArchivo, contenido, tipo = 'application/json') {
		const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
		const enlace = document.createElement('a');
		enlace.href = url;
		enlace.download = nombreArchivo;
		document.body.appendChild(enlace);
		enlace.click();
		enlace.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	/** Abre el selector de archivos y devuelve el texto del archivo elegido */
	function elegirArchivo(aceptar = '.json') {
		return new Promise(resolver => {
			const campo = document.createElement('input');
			campo.type = 'file';
			campo.accept = aceptar;
			campo.onchange = () => {
				const archivo = campo.files[0];
				if (!archivo) return resolver(null);
				archivo.text().then(resolver);
			};
			campo.click();
		});
	}

	/** "2026-11-07" para usar en nombres de archivo */
	function hoy() {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	return { dinero, dineroParaCampo, leerDinero, esc, fechaHora, hora, avisar, modal, cerrarModal, confirmar, descargar, elegirArchivo, hoy };
})();
