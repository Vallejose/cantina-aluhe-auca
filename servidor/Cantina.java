/*
 * Servidor de la cantina. Corre en la laptop (Caja 1) y hace dos cosas:
 *
 *   1. Sirve la app a las tablets por la red local (http://IP-de-la-laptop:8080).
 *   2. Reenvía las impresiones a la impresora térmica (IP:9100, ESC/POS),
 *      de a una y en orden, respetando los interruptores Tickets y Comandas.
 *
 * 3. Guarda una copia central de las ventas y los movimientos de caja de todas
 *    las cajas, en servidor/datos/caja-N.jsonl (ver "Datos centrales" abajo).
 *
 * Su configuración (interruptores e IP de la impresora) va en servidor/cantina.properties.
 *
 * No hace falta compilar: con Java 21 se arranca así, desde la carpeta de la app:
 *     java servidor/Cantina.java
 * (es lo que hace iniciar-cantina.bat). Opciones: --puerto 8080 --sin-navegador
 *
 * API (la usa js/impresion.js):
 *   GET  /api/estado?caja=N         estado general; además anota que la caja N está conectada
 *   POST /api/imprimir?caja=N&que=… cuerpo = bytes ESC/POS; encabezado X-Partes = "ticket:120,comanda:80"
 *                                   (&reimpresion=1 imprime aunque el interruptor esté apagado)
 *   POST /api/reintentar?id=N       vuelve a mandar una impresión que no salió
 *   POST /api/interruptores?tickets=1&comandas=0   solo desde la laptop
 *   POST /api/impresora?ip=…&puerto=9100           solo desde la laptop
 * Datos centrales (la usa js/central.js):
 *   GET  /api/central?caja=N        lo que ya tiene la laptop de esa caja: {"caja":N,"firmas":{clave:firma}}
 *   POST /api/central?caja=N        cuerpo = una línea por registro: clave TAB firma TAB tipo TAB json
 *                                   (tipo = pedido | movimiento). Responde {"estado":"guardado","cantidad":n}
 *   POST /api/central/borrar?caja=N solo cajas de prueba (8 y 9): aparta su archivo (no lo borra)
 *   GET  /api/central/todo          todos los registros vigentes: [{caja, ultimo, registros:[{clave,firma,recibido,tipo,datos}]}]
 *
 * Cada caja sigue guardando todo en su navegador; esto es una copia. El archivo
 * de cada caja solo crece: cada cambio (una venta, una anulación) es una línea
 * nueva y vale la última línea de cada clave. Si se manda dos veces lo mismo,
 * no pasa nada. La clave lleva el número y la fecha de creación, así que una
 * caja que se reinstaló y repite números no pisa las ventas de antes.
 */

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class Cantina {

	static final int MAX_ULTIMAS = 30;          // impresiones que se muestran en la pantalla Impresión
	static final int ESPERA_IMPRESION_SEG = 25; // cuánto espera una caja la respuesta de la impresora
	static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm");

	static Path carpetaApp;
	static Path archivoConfig;

	// Configuración (se guarda en cantina.properties)
	static volatile String ipImpresora = "";
	static volatile int puertoImpresora = 9100;
	static volatile boolean tickets = true;
	static volatile boolean comandas = true;

	// Estado en memoria
	static volatile boolean impresoraConectada = false;
	static final ExecutorService cola = Executors.newSingleThreadExecutor(); // de a una y en orden
	static final AtomicInteger enEspera = new AtomicInteger();
	static final AtomicInteger proximoId = new AtomicInteger(1);
	static final Deque<Trabajo> ultimas = new ConcurrentLinkedDeque<>();
	static final Map<Integer, Caja> cajas = new ConcurrentHashMap<>();
	static final Object impresora = new Object(); // un solo envío a la impresora a la vez
	static Path carpetaDatos;
	/** caja -> clave -> línea guardada (la última de cada clave) */
	static final Map<Integer, Map<String, Registro>> central = new ConcurrentHashMap<>();

	record Registro(String clave, String firma, String recibido, String linea) { }

	static final java.util.regex.Pattern CLAVE_OK = java.util.regex.Pattern.compile("[A-Za-z0-9:.|_\\-]{1,80}");
	static final java.util.regex.Pattern ENCABEZADO = java.util.regex.Pattern.compile(
			"^\\{\"clave\":\"([^\"]*)\",\"firma\":\"([^\"]*)\",\"recibido\":\"([^\"]*)\"");

	/** Una impresión: lo que mandó una caja, ya filtrado por los interruptores */
	static class Trabajo {
		final int id = proximoId.getAndIncrement();
		final String hora = LocalTime.now().format(HORA);
		int caja;
		String que;
		byte[] datos;
		List<String> partes = new ArrayList<>();   // lo que se imprime: ticket, comanda, prueba
		List<String> omitidas = new ArrayList<>(); // lo que no, por un interruptor apagado
		volatile String estado = "esperando";      // esperando | impreso | error | omitido | reintentado
		volatile String error = "";
	}

	static class Caja {
		int numero;
		long vistaEn;
		boolean laptop;
	}

	public static void main(String[] args) throws Exception {
		int puerto = 8080;
		boolean abrirNavegador = true;
		for (int i = 0; i < args.length; i++) {
			if (args[i].equals("--puerto") && i + 1 < args.length) puerto = Integer.parseInt(args[++i]);
			if (args[i].equals("--sin-navegador")) abrirNavegador = false;
		}
		if (Arrays.asList(args).contains("--empezar-limpio")) {
			empezarLimpio();
			return;
		}

		carpetaApp = buscarCarpetaApp();
		archivoConfig = carpetaApp.resolve("servidor").resolve("cantina.properties");
		leerConfig();
		carpetaDatos = carpetaApp.resolve("servidor").resolve("datos");
		leerCentral();

		HttpServer servidor;
		try {
			servidor = HttpServer.create(new InetSocketAddress(puerto), 50);
		} catch (BindException e) {
			System.out.println();
			System.out.println("  El puerto " + puerto + " ya está en uso. ¿Quedó abierta otra ventana del servidor?");
			System.out.println("  Cerrala y volvé a abrir iniciar-cantina.bat.");
			System.exit(1);
			return;
		}
		servidor.createContext("/api/", Cantina::api);
		servidor.createContext("/", Cantina::archivo);
		servidor.setExecutor(Executors.newFixedThreadPool(8));
		servidor.start();

		// Cada 10 segundos se fija si la impresora responde (para el indicador de las cajas)
		Executors.newSingleThreadScheduledExecutor(r -> {
			Thread t = new Thread(r, "verificar-impresora");
			t.setDaemon(true);
			return t;
		}).scheduleWithFixedDelay(Cantina::verificarImpresora, 0, 10, TimeUnit.SECONDS);

		mostrarBienvenida(puerto);
		if (abrirNavegador) abrirNavegador("http://localhost:" + puerto + "/");
	}

	// ------------------------------------------------------------------ API

	static void api(HttpExchange x) throws IOException {
		try {
			String ruta = x.getRequestURI().getPath();
			Map<String, String> q = parametros(x.getRequestURI().getRawQuery());
			boolean post = x.getRequestMethod().equals("POST");
			boolean desdeLaptop = x.getRemoteAddress().getAddress().isLoopbackAddress();

			switch (ruta) {
				case "/api/estado" -> {
					anotarCaja(entero(q.get("caja"), 0), desdeLaptop);
					responder(x, 200, estadoJson(desdeLaptop));
				}
				case "/api/imprimir" -> {
					if (!post) { responder(x, 405, error("Usá POST")); return; }
					int caja = entero(q.get("caja"), 0);
					anotarCaja(caja, desdeLaptop);
					byte[] cuerpo = x.getRequestBody().readAllBytes();
					Trabajo t = armarTrabajo(caja, q.getOrDefault("que", ""), cuerpo,
							x.getRequestHeaders().getFirst("X-Partes"), "1".equals(q.get("reimpresion")));
					if (t == null) { responder(x, 400, error("Pedido de impresión mal armado")); return; }
					responder(x, 200, imprimirYEsperar(t));
				}
				case "/api/reintentar" -> {
					if (!post) { responder(x, 405, error("Usá POST")); return; }
					int id = entero(q.get("id"), -1);
					Trabajo viejo = ultimas.stream().filter(t -> t.id == id).findFirst().orElse(null);
					if (viejo == null) { responder(x, 404, error("Esa impresión ya no está en la lista")); return; }
					Trabajo t = new Trabajo();
					t.caja = viejo.caja;
					t.que = viejo.que;
					t.datos = viejo.datos;
					t.partes = viejo.partes;
					String resultado = imprimirYEsperar(t);
					if ("impreso".equals(t.estado)) viejo.estado = "reintentado";
					responder(x, 200, resultado);
				}
				case "/api/interruptores" -> {
					if (!post) { responder(x, 405, error("Usá POST")); return; }
					if (!desdeLaptop) { responder(x, 403, error("Se cambia desde la laptop")); return; }
					if (q.containsKey("tickets")) tickets = "1".equals(q.get("tickets"));
					if (q.containsKey("comandas")) comandas = "1".equals(q.get("comandas"));
					guardarConfig();
					System.out.println(hora() + "  Tickets " + (tickets ? "SÍ" : "NO") + " · Comandas " + (comandas ? "SÍ" : "NO"));
					responder(x, 200, estadoJson(true));
				}
				case "/api/central" -> {
					int caja = entero(q.get("caja"), 0);
					if (caja < 1 || caja > 9) { responder(x, 400, error("Falta el número de caja")); return; }
					anotarCaja(caja, desdeLaptop);
					if (!post) { responder(x, 200, firmasJson(caja)); return; }
					byte[] cuerpo = x.getRequestBody().readAllBytes();
					if (cuerpo.length > 20_000_000) { responder(x, 400, error("Demasiados datos de una vez")); return; }
					int n = guardarCentral(caja, new String(cuerpo, StandardCharsets.UTF_8));
					if (n < 0) { responder(x, 400, error("Datos mal armados")); return; }
					responder(x, 200, "{\"estado\":\"guardado\",\"cantidad\":" + n + "}");
				}
				case "/api/central/borrar" -> {
					if (!post) { responder(x, 405, error("Usá POST")); return; }
					int caja = entero(q.get("caja"), 0);
					if (caja != 8 && caja != 9) { responder(x, 403, error("Solo las cajas de prueba (8 y 9)")); return; }
					apartarCentral(caja);
					responder(x, 200, "{\"estado\":\"borrado\"}");
				}
				case "/api/central/todo" -> responder(x, 200, todoJson());
				case "/api/impresora" -> {
					if (!post) { responder(x, 405, error("Usá POST")); return; }
					if (!desdeLaptop) { responder(x, 403, error("Se cambia desde la laptop")); return; }
					String ip = q.getOrDefault("ip", "").trim();
					if (!ip.isEmpty() && !ip.matches("[A-Za-z0-9.\\-]+")) { responder(x, 400, error("Dirección no válida")); return; }
					ipImpresora = ip;
					puertoImpresora = entero(q.get("puerto"), 9100);
					guardarConfig();
					verificarImpresora();
					System.out.println(hora() + "  Impresora: " + (ip.isEmpty() ? "sin configurar" : ip + ":" + puertoImpresora));
					responder(x, 200, estadoJson(true));
				}
				default -> responder(x, 404, error("No existe"));
			}
		} catch (Exception e) {
			e.printStackTrace();
			responder(x, 500, error("Error en el servidor: " + e.getMessage()));
		}
	}

	/** Separa las partes (ticket, comanda…) y deja afuera las que tienen el interruptor apagado */
	static Trabajo armarTrabajo(int caja, String que, byte[] cuerpo, String encabezado, boolean reimpresion) {
		if (encabezado == null || encabezado.isBlank()) return null;
		Trabajo t = new Trabajo();
		t.caja = caja;
		t.que = que.length() > 80 ? que.substring(0, 80) : que;
		ByteArrayOutputStream datos = new ByteArrayOutputStream();
		int desde = 0;
		for (String parte : encabezado.split(",")) {
			String[] p = parte.trim().split(":");
			if (p.length != 2) return null;
			String tipo = p[0];
			int largo = entero(p[1], -1);
			if (largo < 0 || desde + largo > cuerpo.length) return null;
			boolean encendido = switch (tipo) {
				case "ticket" -> tickets;
				case "comanda" -> comandas;
				default -> true; // la hoja de prueba sale siempre
			};
			if (encendido || reimpresion) {
				datos.write(cuerpo, desde, largo);
				t.partes.add(tipo);
			} else {
				t.omitidas.add(tipo);
			}
			desde += largo;
		}
		t.datos = datos.toByteArray();
		// Si un interruptor dejó afuera una parte, que la lista diga lo que de verdad salió
		if (t.que.startsWith("Ticket y comanda ") && t.partes.size() == 1)
			t.que = (t.partes.get(0).equals("ticket") ? "Ticket " : "Comanda ") + t.que.substring("Ticket y comanda ".length());
		return t;
	}

	/** Pone la impresión en la cola y espera a que salga (o falle) para contestarle a la caja */
	static String imprimirYEsperar(Trabajo t) {
		agregarAUltimas(t);
		if (t.partes.isEmpty()) {
			t.estado = "omitido";
			return resultadoJson(t);
		}
		enEspera.incrementAndGet();
		Future<?> f = cola.submit(() -> {
			try {
				enviarAImpresora(t.datos);
				t.estado = "impreso";
				impresoraConectada = true;
				System.out.println(t.hora + "  Caja " + t.caja + " · " + t.que + " · impreso");
			} catch (Exception e) {
				t.estado = "error";
				t.error = mensajeDeError(e);
				impresoraConectada = false;
				System.out.println(t.hora + "  Caja " + t.caja + " · " + t.que + " · NO SALIÓ: " + t.error);
			} finally {
				enEspera.decrementAndGet();
			}
		});
		try {
			f.get(ESPERA_IMPRESION_SEG, TimeUnit.SECONDS);
		} catch (TimeoutException e) {
			// Sigue en la cola; la caja ve "esperando" y lo puede ver en la pantalla Impresión
		} catch (Exception e) {
			t.estado = "error";
			t.error = e.getMessage();
		}
		return resultadoJson(t);
	}

	static void enviarAImpresora(byte[] datos) throws IOException {
		if (ipImpresora.isEmpty()) throw new IOException("No hay impresora configurada");
		synchronized (impresora) {
			try (Socket s = new Socket()) {
				s.connect(new InetSocketAddress(ipImpresora, puertoImpresora), 3000);
				s.setSoTimeout(5000);
				OutputStream salida = s.getOutputStream();
				salida.write(datos);
				salida.flush();
				s.shutdownOutput();
			}
		}
	}

	static void verificarImpresora() {
		if (ipImpresora.isEmpty()) { impresoraConectada = false; return; }
		if (enEspera.get() > 0) return; // mientras imprime no la molestamos
		synchronized (impresora) {
			try (Socket s = new Socket()) {
				s.connect(new InetSocketAddress(ipImpresora, puertoImpresora), 1500);
				impresoraConectada = true;
			} catch (IOException e) {
				impresoraConectada = false;
			}
		}
	}

	static String mensajeDeError(Exception e) {
		if (e instanceof SocketTimeoutException) return "La impresora no contesta (" + ipImpresora + ")";
		if (e instanceof ConnectException || e instanceof NoRouteToHostException) return "No se pudo conectar con la impresora (" + ipImpresora + ")";
		if (e instanceof UnknownHostException) return "Dirección de impresora no válida";
		return e.getMessage() == null ? "Error al imprimir" : e.getMessage();
	}

	static void agregarAUltimas(Trabajo t) {
		ultimas.addFirst(t);
		while (ultimas.size() > MAX_ULTIMAS) ultimas.removeLast();
	}

	static void anotarCaja(int numero, boolean laptop) {
		if (numero < 1 || numero > 9) return;
		Caja c = cajas.computeIfAbsent(numero, n -> new Caja());
		c.numero = numero;
		c.vistaEn = System.currentTimeMillis();
		c.laptop = laptop;
	}

	// ------------------------------------------------------- Datos centrales

	static Map<String, Registro> deCaja(int caja) {
		return central.computeIfAbsent(caja, n -> new LinkedHashMap<>());
	}

	static Path archivoCentral(int caja) {
		return carpetaDatos.resolve("caja-" + caja + ".jsonl");
	}

	/**
	 * Guarda las líneas "clave TAB firma TAB tipo TAB json". Primero revisa
	 * todas; si una está mal no guarda ninguna. Devuelve cuántas guardó, o -1.
	 */
	static int guardarCentral(int caja, String cuerpo) throws IOException {
		String recibido = java.time.OffsetDateTime.now().withNano(0).toString();
		List<Registro> nuevos = new ArrayList<>();
		for (String renglon : cuerpo.split("\n")) {
			if (renglon.isBlank()) continue;
			String[] p = renglon.split("\t", 4);
			if (p.length != 4) return -1;
			String clave = p[0], firma = p[1], tipo = p[2], json = p[3].trim();
			if (!CLAVE_OK.matcher(clave).matches() || !CLAVE_OK.matcher(firma).matches()) return -1;
			if (!tipo.equals("pedido") && !tipo.equals("movimiento")) return -1;
			if (!json.startsWith("{") || !json.endsWith("}") || json.contains("\n")) return -1;
			String linea = "{\"clave\":" + texto(clave) + ",\"firma\":" + texto(firma) + ",\"recibido\":" + texto(recibido)
					+ ",\"tipo\":" + texto(tipo) + ",\"datos\":" + json + "}";
			nuevos.add(new Registro(clave, firma, recibido, linea));
		}
		if (nuevos.isEmpty()) return 0;
		Map<String, Registro> mapa = deCaja(caja);
		synchronized (mapa) {
			Files.createDirectories(carpetaDatos);
			StringBuilder texto = new StringBuilder();
			for (Registro r : nuevos) texto.append(r.linea()).append('\n');
			// Primero al disco: si falla, la caja no lo da por guardado y lo vuelve a mandar
			Files.writeString(archivoCentral(caja), texto, StandardCharsets.UTF_8,
					StandardOpenOption.CREATE, StandardOpenOption.APPEND);
			for (Registro r : nuevos) mapa.put(r.clave(), r);
		}
		System.out.println(hora() + "  Caja " + caja + " · " + nuevos.size() + (nuevos.size() == 1 ? " cambio guardado" : " cambios guardados") + " en la laptop");
		return nuevos.size();
	}

	/** Al arrancar: lee los archivos de servidor/datos/ (vale la última línea de cada clave) */
	static void leerCentral() {
		for (int caja = 1; caja <= 9; caja++) {
			Path archivo = archivoCentral(caja);
			if (!Files.exists(archivo)) continue;
			Map<String, Registro> mapa = deCaja(caja);
			int malas = 0;
			try {
				for (String linea : Files.readAllLines(archivo, StandardCharsets.UTF_8)) {
					if (linea.isBlank()) continue;
					var m = ENCABEZADO.matcher(linea);
					if (!m.find() || !linea.endsWith("}")) { malas++; continue; } // p. ej. una línea cortada por un apagón
					mapa.put(m.group(1), new Registro(m.group(1), m.group(2), m.group(3), linea));
				}
			} catch (IOException e) {
				System.out.println("No se pudo leer " + archivo + ": " + e.getMessage());
			}
			if (malas > 0) System.out.println("  " + archivo.getFileName() + ": " + malas + " línea(s) incompleta(s), se saltean");
		}
	}

	/** Cajas de prueba: el archivo se renombra (queda como respaldo) y la laptop se olvida de esa caja */
	static void apartarCentral(int caja) throws IOException {
		Map<String, Registro> mapa = deCaja(caja);
		synchronized (mapa) {
			Path archivo = archivoCentral(caja);
			if (Files.exists(archivo)) {
				String sello = java.time.LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
				Files.move(archivo, carpetaDatos.resolve("caja-" + caja + "-reseteada-" + sello + ".jsonl"));
			}
			mapa.clear();
		}
		System.out.println(hora() + "  Caja " + caja + " (prueba) · reseteada también en la laptop");
	}

	static String firmasJson(int caja) {
		Map<String, Registro> mapa = deCaja(caja);
		StringJoiner j = new StringJoiner(",", "{", "}");
		synchronized (mapa) {
			for (Registro r : mapa.values()) j.add(texto(r.clave()) + ":" + texto(r.firma()));
		}
		return "{\"caja\":" + caja + ",\"firmas\":" + j + "}";
	}

	static String todoJson() {
		StringJoiner lista = new StringJoiner(",", "[", "]");
		for (int caja = 1; caja <= 9; caja++) {
			Map<String, Registro> mapa = central.get(caja);
			if (mapa == null) continue;
			StringJoiner registros = new StringJoiner(",", "[", "]");
			String ultimo = "";
			synchronized (mapa) {
				if (mapa.isEmpty()) continue;
				for (Registro r : mapa.values()) {
					registros.add(r.linea());
					if (r.recibido().compareTo(ultimo) > 0) ultimo = r.recibido();
				}
			}
			lista.add("{\"caja\":" + caja + ",\"ultimo\":" + texto(ultimo) + ",\"registros\":" + registros + "}");
		}
		return lista.toString();
	}

	// ----------------------------------------------------------------- JSON

	static String estadoJson(boolean desdeLaptop) {
		long ahora = System.currentTimeMillis();
		StringJoiner listaCajas = new StringJoiner(",", "[", "]");
		cajas.values().stream().sorted(Comparator.comparingInt(c -> c.numero)).forEach(c ->
				listaCajas.add("{\"caja\":" + c.numero + ",\"haceSeg\":" + (ahora - c.vistaEn) / 1000 + ",\"laptop\":" + c.laptop + "}"));
		StringJoiner listaUltimas = new StringJoiner(",", "[", "]");
		for (Trabajo t : ultimas) listaUltimas.add(resultadoJson(t));
		return "{\"servidor\":true"
				+ ",\"esLaptop\":" + desdeLaptop
				+ ",\"tickets\":" + tickets
				+ ",\"comandas\":" + comandas
				+ ",\"impresora\":{\"ip\":" + texto(ipImpresora) + ",\"puerto\":" + puertoImpresora
				+ ",\"configurada\":" + !ipImpresora.isEmpty() + ",\"conectada\":" + impresoraConectada + "}"
				+ ",\"enEspera\":" + enEspera.get()
				+ ",\"cajas\":" + listaCajas
				+ ",\"ultimas\":" + listaUltimas + "}";
	}

	static String resultadoJson(Trabajo t) {
		return "{\"id\":" + t.id + ",\"hora\":" + texto(t.hora) + ",\"caja\":" + t.caja + ",\"que\":" + texto(t.que)
				+ ",\"estado\":" + texto(t.estado) + ",\"error\":" + texto(t.error)
				+ ",\"impreso\":" + listaTexto("impreso".equals(t.estado) ? t.partes : List.of())
				+ ",\"partes\":" + listaTexto(t.partes)
				+ ",\"omitido\":" + listaTexto(t.omitidas) + "}";
	}

	static String error(String mensaje) {
		return "{\"estado\":\"error\",\"error\":" + texto(mensaje) + "}";
	}

	static String listaTexto(List<String> lista) {
		StringJoiner j = new StringJoiner(",", "[", "]");
		lista.forEach(s -> j.add(texto(s)));
		return j.toString();
	}

	static String texto(String s) {
		StringBuilder b = new StringBuilder("\"");
		for (char c : (s == null ? "" : s).toCharArray()) {
			switch (c) {
				case '"' -> b.append("\\\"");
				case '\\' -> b.append("\\\\");
				case '\n' -> b.append("\\n");
				case '\r' -> b.append("\\r");
				case '\t' -> b.append("\\t");
				default -> {
					if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
					else b.append(c);
				}
			}
		}
		return b.append('"').toString();
	}

	// ------------------------------------------------------- Archivos de la app

	static final Map<String, String> TIPOS = Map.ofEntries(
			Map.entry("html", "text/html; charset=utf-8"),
			Map.entry("js", "text/javascript; charset=utf-8"),
			Map.entry("css", "text/css; charset=utf-8"),
			Map.entry("json", "application/json; charset=utf-8"),
			Map.entry("webmanifest", "application/manifest+json; charset=utf-8"),
			Map.entry("png", "image/png"),
			Map.entry("svg", "image/svg+xml"),
			Map.entry("ico", "image/x-icon"),
			Map.entry("md", "text/plain; charset=utf-8"));

	static void archivo(HttpExchange x) throws IOException {
		try {
			if (!x.getRequestMethod().equals("GET") && !x.getRequestMethod().equals("HEAD")) {
				responder(x, 405, error("Usá GET"));
				return;
			}
			String ruta = URLDecoder.decode(x.getRequestURI().getPath(), StandardCharsets.UTF_8);
			if (ruta.endsWith("/")) ruta += "index.html";
			Path pedido = carpetaApp.resolve(ruta.substring(1)).normalize();
			// No se sirve nada de afuera de la carpeta de la app, ni la configuración del servidor
			if (!pedido.startsWith(carpetaApp) || pedido.startsWith(carpetaApp.resolve("servidor"))
					|| pedido.startsWith(carpetaApp.resolve(".git")) || !Files.isRegularFile(pedido)) {
				byte[] nada = "No existe".getBytes(StandardCharsets.UTF_8);
				x.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
				x.sendResponseHeaders(404, nada.length);
				x.getResponseBody().write(nada);
				return;
			}
			String nombre = pedido.getFileName().toString();
			String ext = nombre.contains(".") ? nombre.substring(nombre.lastIndexOf('.') + 1).toLowerCase() : "";
			byte[] datos = Files.readAllBytes(pedido);
			x.getResponseHeaders().set("Content-Type", TIPOS.getOrDefault(ext, "application/octet-stream"));
			x.getResponseHeaders().set("Cache-Control", "no-cache"); // así las tablets ven siempre la última versión
			if (x.getRequestMethod().equals("HEAD")) {
				x.sendResponseHeaders(200, -1);
			} else {
				x.sendResponseHeaders(200, datos.length);
				x.getResponseBody().write(datos);
			}
		} finally {
			x.close();
		}
	}

	static void responder(HttpExchange x, int codigo, String json) throws IOException {
		byte[] datos = json.getBytes(StandardCharsets.UTF_8);
		x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		x.getResponseHeaders().set("Cache-Control", "no-store");
		x.sendResponseHeaders(codigo, datos.length);
		try (OutputStream o = x.getResponseBody()) {
			o.write(datos);
		}
	}

	// ---------------------------------------------------------- Configuración

	static void leerConfig() {
		Properties p = new Properties();
		if (Files.exists(archivoConfig)) {
			try (Reader r = Files.newBufferedReader(archivoConfig, StandardCharsets.UTF_8)) {
				p.load(r);
			} catch (IOException e) {
				System.out.println("No se pudo leer " + archivoConfig + ": se usan los valores de siempre.");
			}
		}
		ipImpresora = p.getProperty("impresora.ip", "").trim();
		puertoImpresora = entero(p.getProperty("impresora.puerto"), 9100);
		tickets = !"no".equals(p.getProperty("tickets", "si"));
		comandas = !"no".equals(p.getProperty("comandas", "si"));
	}

	static synchronized void guardarConfig() {
		Properties p = new Properties();
		p.setProperty("impresora.ip", ipImpresora);
		p.setProperty("impresora.puerto", String.valueOf(puertoImpresora));
		p.setProperty("tickets", tickets ? "si" : "no");
		p.setProperty("comandas", comandas ? "si" : "no");
		try (Writer w = Files.newBufferedWriter(archivoConfig, StandardCharsets.UTF_8)) {
			p.store(w, "Configuracion del servidor de la cantina (la cambia la pantalla Ajustes > Impresion)");
		} catch (IOException e) {
			System.out.println("No se pudo guardar la configuración: " + e.getMessage());
		}
	}

	// ------------------------------------------------------------- Varios

	static Path buscarCarpetaApp() {
		for (String candidata : new String[] { ".", ".." }) {
			Path p = Paths.get(candidata).toAbsolutePath().normalize();
			if (Files.exists(p.resolve("index.html")) && Files.isDirectory(p.resolve("servidor"))) return p;
		}
		System.out.println("No encuentro la app (index.html). Arrancá el servidor desde la carpeta de la cantina.");
		System.exit(1);
		return null;
	}

	static void mostrarBienvenida(int puerto) {
		System.out.println();
		System.out.println("  ==============================================");
		System.out.println("   CANTINA ALUHE AUCA · servidor encendido");
		System.out.println("  ==============================================");
		System.out.println();
		System.out.println("   En esta laptop:   http://localhost:" + puerto);
		for (String ip : direccionesLocales()) System.out.println("   En las tablets:   http://" + ip + ":" + puerto);
		System.out.println();
		System.out.println("   Impresora:  " + (ipImpresora.isEmpty() ? "sin configurar (Ajustes > Impresión)" : ipImpresora + ":" + puertoImpresora));
		System.out.println("   Tickets " + (tickets ? "SÍ" : "NO") + " · Comandas " + (comandas ? "SÍ" : "NO"));
		System.out.println();
		// Ventas que ya tiene guardadas: si son de pruebas viejas, se suman al evento (ver empezar-limpio.bat)
		boolean hayVentas = false;
		for (int caja = 1; caja <= 7; caja++) {
			Map<String, Registro> mapa = central.get(caja);
			if (mapa == null || mapa.isEmpty()) continue;
			if (!hayVentas) {
				System.out.println("   Ventas ya guardadas en esta laptop:");
				hayVentas = true;
			}
			long pedidos = mapa.values().stream().filter(r -> r.linea().contains("\"tipo\":\"pedido\"")).count();
			String ultimo = mapa.values().stream().map(Registro::recibido).max(String::compareTo).orElse("");
			System.out.println("     Caja " + caja + ": " + pedidos + " pedidos (último " + fechaCorta(ultimo) + ")");
		}
		if (hayVentas) {
			System.out.println("   Si son de pruebas y el evento todavía no empezó, cerrá esta ventana");
			System.out.println("   y abrí empezar-limpio.bat antes de vender.");
			System.out.println();
		}
		System.out.println("   No cierres esta ventana mientras dure el evento.");
		System.out.println();
	}

	/**
	 * Antes del evento (empezar-limpio.bat): aparta las ventas guardadas en la laptop
	 * (servidor/datos/ y los resúmenes viejos de servidor/cierres/) en
	 * servidor/apartado-AAAAMMDD-HHMM/. No borra nada: si hiciera falta, se vuelven a copiar.
	 * Los interruptores y la IP de la impresora quedan como estaban.
	 */
	static void empezarLimpio() throws IOException {
		Path servidor = buscarCarpetaApp().resolve("servidor");
		// Con el servidor abierto no sirve: tiene las ventas en memoria y las volvería a mostrar
		try (ServerSocket prueba = new ServerSocket(8080)) {
		} catch (IOException e) {
			System.out.println();
			System.out.println("   El servidor está abierto. Cerrá primero su ventana negra y volvé a abrir empezar-limpio.bat.");
			return;
		}
		List<Path> mover = new ArrayList<>();
		for (String carpeta : new String[] { "datos", "cierres" }) {
			Path c = servidor.resolve(carpeta);
			if (!Files.isDirectory(c)) continue;
			try (var lista = Files.list(c)) {
				lista.filter(Files::isRegularFile).forEach(mover::add);
			}
		}
		System.out.println();
		if (mover.isEmpty()) {
			System.out.println("   No hay ventas guardadas en esta laptop: ya está limpia.");
			return;
		}
		System.out.println("   Se van a apartar " + mover.size() + " archivo(s) de ventas guardadas en esta laptop:");
		mover.forEach(p -> System.out.println("     " + servidor.relativize(p)));
		System.out.println();
		System.out.print("   Para seguir escribí SI y apretá Enter: ");
		String respuesta = new BufferedReader(new InputStreamReader(System.in)).readLine();
		if (respuesta == null || !respuesta.trim().equalsIgnoreCase("SI")) {
			System.out.println("   No se tocó nada.");
			return;
		}
		Path destino = servidor.resolve("apartado-" + java.time.LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmm")));
		for (Path p : mover) {
			Path d = destino.resolve(servidor.relativize(p));
			Files.createDirectories(d.getParent());
			Files.move(p, d);
		}
		System.out.println("   Listo: quedaron en " + servidor.relativize(destino) + ". La laptop empieza sin ventas.");
		System.out.println("   Falta borrar los datos de cada tablet o navegador que vendió como caja 1 a 7 (ver la guía).");
	}

	/** "2026-11-12T21:05:33-03:00" → "12/11 21:05" (hora local) */
	static String fechaCorta(String iso) {
		try {
			return java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
					.format(DateTimeFormatter.ofPattern("dd/MM HH:mm"));
		} catch (Exception e) {
			return iso;
		}
	}

	static List<String> direccionesLocales() {
		List<String> lista = new ArrayList<>();
		try {
			for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
				if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
				for (InetAddress a : Collections.list(ni.getInetAddresses()))
					if (a instanceof Inet4Address && !a.isLinkLocalAddress()) lista.add(a.getHostAddress());
			}
		} catch (SocketException ignorada) {
		}
		return lista;
	}

	static void abrirNavegador(String url) {
		try {
			if (!java.awt.GraphicsEnvironment.isHeadless() && java.awt.Desktop.isDesktopSupported())
				java.awt.Desktop.getDesktop().browse(URI.create(url));
		} catch (Throwable ignorada) {
			// Si no se puede, se abre a mano
		}
	}

	static Map<String, String> parametros(String query) {
		Map<String, String> m = new HashMap<>();
		if (query == null) return m;
		for (String par : query.split("&")) {
			int i = par.indexOf('=');
			if (i < 0) m.put(URLDecoder.decode(par, StandardCharsets.UTF_8), "");
			else m.put(URLDecoder.decode(par.substring(0, i), StandardCharsets.UTF_8),
					URLDecoder.decode(par.substring(i + 1), StandardCharsets.UTF_8));
		}
		return m;
	}

	static int entero(String s, int porDefecto) {
		try {
			return s == null ? porDefecto : Integer.parseInt(s.trim());
		} catch (NumberFormatException e) {
			return porDefecto;
		}
	}

	static String hora() {
		return LocalTime.now().format(HORA);
	}
}
