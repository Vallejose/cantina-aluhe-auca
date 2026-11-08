/*
 * Generador mínimo de archivos Excel (.xlsx), sin librerías externas, para que
 * funcione sin internet.
 *
 * Un .xlsx es un .zip con varios archivos XML adentro. Acá se arma ese zip "a
 * mano" (sin comprimir, que Excel acepta igual) con una hoja por tabla.
 *
 * Uso:
 *   const bytes = XLSX.libro([tabla1, tabla2, ...]);
 *
 * Cada tabla es { nombre, columnas: [{ titulo, tipo, ancho }], filas, total }:
 *   tipo  'texto' | 'numero' | 'dinero' ('dinero' viene en centésimos)
 *   filas lista de filas, cada fila una lista de valores en el orden de las columnas
 *   total (opcional) una fila más, en negrita, al final
 */
const XLSX = (() => {

	// ------------------------------------------------------------------ Zip

	const TABLA_CRC = (() => {
		const t = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c >>> 0;
		}
		return t;
	})();

	function crc32(bytes) {
		let c = 0xFFFFFFFF;
		for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
		return (c ^ 0xFFFFFFFF) >>> 0;
	}

	/** archivos = [{ nombre, texto }] → Uint8Array con el .zip (sin compresión) */
	function zip(archivos) {
		const utf8 = new TextEncoder();
		const partes = [];
		const central = [];
		let desplazamiento = 0;

		// Fecha y hora fijas en formato DOS (no importan para Excel)
		const hora = 0, fecha = ((2026 - 1980) << 9) | (1 << 5) | 1;

		for (const a of archivos) {
			const nombre = utf8.encode(a.nombre);
			const datos = utf8.encode(a.texto);
			const crc = crc32(datos);

			const local = new DataView(new ArrayBuffer(30));
			local.setUint32(0, 0x04034b50, true);
			local.setUint16(4, 20, true);
			local.setUint16(6, 0x0800, true);      // nombres en UTF-8
			local.setUint16(8, 0, true);           // sin compresión
			local.setUint16(10, hora, true);
			local.setUint16(12, fecha, true);
			local.setUint32(14, crc, true);
			local.setUint32(18, datos.length, true);
			local.setUint32(22, datos.length, true);
			local.setUint16(26, nombre.length, true);
			local.setUint16(28, 0, true);
			partes.push(new Uint8Array(local.buffer), nombre, datos);

			const cd = new DataView(new ArrayBuffer(46));
			cd.setUint32(0, 0x02014b50, true);
			cd.setUint16(4, 20, true);
			cd.setUint16(6, 20, true);
			cd.setUint16(8, 0x0800, true);
			cd.setUint16(10, 0, true);
			cd.setUint16(12, hora, true);
			cd.setUint16(14, fecha, true);
			cd.setUint32(16, crc, true);
			cd.setUint32(20, datos.length, true);
			cd.setUint32(24, datos.length, true);
			cd.setUint16(28, nombre.length, true);
			cd.setUint32(42, desplazamiento, true);
			central.push(new Uint8Array(cd.buffer), nombre);

			desplazamiento += 30 + nombre.length + datos.length;
		}

		const tamCentral = central.reduce((s, p) => s + p.length, 0);
		const fin = new DataView(new ArrayBuffer(22));
		fin.setUint32(0, 0x06054b50, true);
		fin.setUint16(8, archivos.length, true);
		fin.setUint16(10, archivos.length, true);
		fin.setUint32(12, tamCentral, true);
		fin.setUint32(16, desplazamiento, true);

		const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
		const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
		let pos = 0;
		for (const p of todo) { salida.set(p, pos); pos += p.length; }
		return salida;
	}

	// ------------------------------------------------------------ Excel XML

	const escXml = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

	/** 0 → A, 25 → Z, 26 → AA */
	const letra = n => (n >= 26 ? letra(Math.floor(n / 26) - 1) : '') + String.fromCharCode(65 + (n % 26));

	// Estilos (índices de cellXfs en styles.xml)
	const ESTILO = { normal: 0, encabezado: 1, dinero: 2, totalDinero: 3, totalTexto: 4, totalNumero: 5 };

	const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot; #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6DF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

	function celda(ref, valor, tipo, esTotal) {
		if (valor == null || valor === '') return esTotal ? `<c r="${ref}" s="${ESTILO.totalTexto}"/>` : '';
		if (tipo === 'dinero')
			return `<c r="${ref}" s="${esTotal ? ESTILO.totalDinero : ESTILO.dinero}"><v>${valor / 100}</v></c>`;
		if (tipo === 'numero')
			return `<c r="${ref}"${esTotal ? ` s="${ESTILO.totalNumero}"` : ''}><v>${valor}</v></c>`;
		return `<c r="${ref}" t="inlineStr"${esTotal ? ` s="${ESTILO.totalTexto}"` : ''}><is><t xml:space="preserve">${escXml(valor)}</t></is></c>`;
	}

	function hoja(tabla) {
		const filas = [];
		filas.push(`<row r="1">${tabla.columnas.map((c, i) =>
			`<c r="${letra(i)}1" t="inlineStr" s="${ESTILO.encabezado}"><is><t>${escXml(c.titulo)}</t></is></c>`).join('')}</row>`);
		tabla.filas.forEach((fila, f) => {
			const r = f + 2;
			filas.push(`<row r="${r}">${fila.map((v, i) => celda(letra(i) + r, v, tabla.columnas[i].tipo, false)).join('')}</row>`);
		});
		if (tabla.total) {
			const r = tabla.filas.length + 2;
			filas.push(`<row r="${r}">${tabla.total.map((v, i) => celda(letra(i) + r, v, tabla.columnas[i].tipo, true)).join('')}</row>`);
		}
		const anchos = tabla.columnas.map((c, i) =>
			`<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join('');

		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${anchos}</cols>
<sheetData>${filas.join('')}</sheetData>
</worksheet>`;
	}

	/** Nombre de pestaña válido para Excel: máximo 31 caracteres y sin []:*?/\ */
	const nombreHoja = t => String(t).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

	function libro(tablas) {
		const n = tablas.length;
		const indices = tablas.map((_, i) => i + 1);
		const archivos = [
			{
				nombre: '[Content_Types].xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${indices.map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
			},
			{
				nombre: '_rels/.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
			},
			{
				nombre: 'xl/workbook.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${tablas.map((t, i) => `<sheet name="${escXml(nombreHoja(t.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`,
			},
			{
				nombre: 'xl/_rels/workbook.xml.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${indices.map(i => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('\n')}
<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
			},
			{ nombre: 'xl/styles.xml', texto: ESTILOS_XML },
			...tablas.map((t, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hoja(t) })),
		];
		return zip(archivos);
	}

	return { libro };
})();
