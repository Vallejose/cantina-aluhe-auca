/*
 * Service worker: guarda una copia de la app en el dispositivo para que abra
 * sin internet. Los DATOS no están acá (están en IndexedDB): esto es solo el
 * programa.
 *
 * Con conexión siempre usa los archivos nuevos. Si se agrega un archivo a la
 * app, sumarlo a ARCHIVOS y cambiar VERSION para que quede disponible sin internet.
 */
const VERSION = 'cantina-v12';

const ARCHIVOS = [
	'./',
	'index.html',
	'manifest.webmanifest',
	'css/estilos.css',
	'js/util.js',
	'js/db.js',
	'js/datos.js',
	'js/documentos.js',
	'js/xlsx.js',
	'js/exportaciones.js',
	'js/escpos.js',
	'js/impresion.js',
	'js/resumen.js',
	'js/central.js',
	'js/app.js',
	'js/pantallas/vender.js',
	'js/pantallas/pedidos.js',
	'js/pantallas/movimientos.js',
	'js/pantallas/cierre.js',
	'js/pantallas/configuracion.js',
	'js/pantallas/articulos.js',
	'js/pantallas/medios.js',
	'js/pantallas/impresion.js',
	'iconos/icono-192.png',
	'iconos/icono-512.png',
];

self.addEventListener('install', evento => {
	evento.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

// Borra las copias de versiones anteriores
self.addEventListener('activate', evento => {
	evento.waitUntil(
		caches.keys()
			.then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
			.then(() => self.clients.claim()));
});

// Primero la red (así siempre se ve la última versión); sin internet, la copia guardada
self.addEventListener('fetch', evento => {
	if (evento.request.method !== 'GET') return;
	// Lo que contesta la laptop sobre la impresora nunca se guarda
	if (new URL(evento.request.url).pathname.includes('/api/')) return;
	evento.respondWith(
		fetch(evento.request)
			.then(respuesta => {
				const copia = respuesta.clone();
				if (respuesta.ok) caches.open(VERSION).then(c => c.put(evento.request, copia));
				return respuesta;
			})
			.catch(() => caches.match(evento.request, { ignoreSearch: true })));
});
