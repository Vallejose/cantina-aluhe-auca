/*
 * Arranque y navegación.
 *
 * Cada pantalla es un objeto { titulo, icono, dibujar(contenedor) } registrado
 * en PANTALLAS. La dirección (#vender, #articulos, ...) dice cuál mostrar, así
 * el botón "atrás" del navegador y de Android funcionan.
 */
const PANTALLAS = {
	vender: PantallaVender,
	pedidos: PantallaPedidos,
	movimientos: PantallaMovimientos,
	cierre: PantallaCierre,
	articulos: PantallaArticulos,
	medios: PantallaMedios,
	configuracion: PantallaConfiguracion,
	impresion: PantallaImpresion,
};

/** Menú: el trabajo diario siempre a la vista; los ajustes, dentro de un desplegable */
const MENU_DIARIO = ['vender', 'pedidos', 'movimientos', 'cierre'];
const MENU_AJUSTES = ['impresion', 'articulos', 'medios', 'configuracion'];

const App = {

	async iniciar() {
		await DB.abrir();

		// Pide al navegador que no borre los datos si le falta espacio
		if (navigator.storage?.persist) navigator.storage.persist();

		// Funciona sin internet una vez instalada (solo con https o localhost)
		if ('serviceWorker' in navigator && location.protocol !== 'file:')
			navigator.serviceWorker.register('sw.js').catch(() => { });

		window.addEventListener('hashchange', () => this.mostrar());
		await this.mostrar();

		// Estado de la impresora de la laptop, cada 5 segundos
		Impresion.iniciar();
	},

	async mostrar() {
		const configurado = await Datos.estaConfigurado();
		let nombre = location.hash.slice(1) || 'vender';

		// Hasta que el equipo no tenga su número no se puede hacer nada más
		if (!configurado) nombre = 'configuracion';
		if (!PANTALLAS[nombre]) nombre = 'vender';

		// Al salir de Vender, el ticket del último pedido deja de mostrarse
		if (nombre !== 'vender') PantallaVender.confirmado = null;

		await this.dibujarMenu(nombre, configurado);
		const contenedor = document.getElementById('contenido');
		contenedor.innerHTML = '';
		contenedor.scrollTop = 0;
		contenedor.classList.toggle('completa', !!PANTALLAS[nombre].completa && !PantallaVender.confirmado);
		await PANTALLAS[nombre].dibujar(contenedor);
	},

	async dibujarMenu(actual, configurado) {
		const cfg = await Datos.configuracion();
		const menu = document.getElementById('menu');
		const enlace = clave => {
			const p = PANTALLAS[clave];
			const clase = (clave === actual ? 'activo' : '') + (!configurado && clave !== 'configuracion' ? ' bloqueado' : '');
			return `<a href="#${clave}" class="${clase}"><span class="icono">${p.icono}</span><span>${p.titulo}</span></a>`;
		};

		// Los ajustes quedan plegados, salvo que se esté en uno de ellos o falte configurar
		const ajustesAbiertos = MENU_AJUSTES.includes(actual) || !configurado;

		menu.innerHTML = `
			<div class="marca">
				<div class="marca-nombre">${Util.esc(cfg.nombreCantina || Datos.NOMBRE_POR_DEFECTO)}</div>
				<div class="marca-equipo">${cfg.equipo ? 'Caja ' + cfg.equipo + (cfg.prueba ? ' · prueba' : '') : 'Sin configurar'}</div>
			</div>
			${MENU_DIARIO.map(enlace).join('')}
			<hr>
			<details class="ajustes" ${ajustesAbiertos ? 'open' : ''}>
				<summary><span class="icono">🛠️</span><span>Ajustes</span></summary>
				${MENU_AJUSTES.map(enlace).join('')}
			</details>
			<div id="indicador-impresora" class="indicador-impresora"></div>`;
		Impresion.dibujarIndicador();

		// En los equipos de prueba, una franja amarilla arriba de todo
		const franja = document.getElementById('franja-prueba');
		franja.textContent = cfg.prueba ? `MODO PRUEBA · Caja ${cfg.equipo} · estas ventas no cuentan` : '';
		franja.classList.toggle('oculto', !cfg.prueba);
	},
};

App.iniciar();
