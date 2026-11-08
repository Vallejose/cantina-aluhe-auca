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
	caja: PantallaCaja,
	cierre: PantallaCierre,
	articulos: PantallaArticulos,
	medios: PantallaMedios,
	configuracion: PantallaConfiguracion,
};

/** Separador visual en el menú entre "trabajo diario" y "ajustes" */
const MENU = ['vender', 'pedidos', 'caja', 'cierre', '-', 'articulos', 'medios', 'configuracion'];

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
		const items = MENU.map(clave => {
			if (clave === '-') return '<hr>';
			const p = PANTALLAS[clave];
			const clase = (clave === actual ? 'activo' : '') + (!configurado && clave !== 'configuracion' ? ' bloqueado' : '');
			return `<a href="#${clave}" class="${clase}"><span class="icono">${p.icono}</span><span>${p.titulo}</span></a>`;
		}).join('');

		menu.innerHTML = `
			<div class="marca">
				<div class="marca-nombre">${Util.esc(cfg.nombreCantina || Datos.NOMBRE_POR_DEFECTO)}</div>
				<div class="marca-equipo">${cfg.equipo ? 'Equipo ' + cfg.equipo + (cfg.prueba ? ' · prueba' : '') : 'Sin configurar'}</div>
			</div>
			${items}`;

		// En los equipos de prueba, una franja amarilla arriba de todo
		const franja = document.getElementById('franja-prueba');
		franja.textContent = cfg.prueba ? `MODO PRUEBA · Equipo ${cfg.equipo} · estas ventas no cuentan` : '';
		franja.classList.toggle('oculto', !cfg.prueba);
	},
};

App.iniciar();
