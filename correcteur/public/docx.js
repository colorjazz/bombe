// Document Word (.docx) fabriqué dans le navigateur, sans bibliothèque : rien ne quitte l'appareil.
// Un .docx est un fichier ZIP contenant du XML ; ici, ZIP sans compression (« stored »), largement suffisant pour du texte.
// Blocs acceptés : { title }, { h }, { p, bold, italic, muted }, { bullet }, { table: [[cellule, …], …], widths: [twips…] }, { pagebreak: true }.

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // caractères interdits en XML
const FONT = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
const run = (text, { bold, italic, size = 22, color } = {}) => `<w:r><w:rPr>${FONT}${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (runs, { before = 0, after = 100, indent, keep } = {}) => `<w:p><w:pPr>${keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${before}" w:after="${after}"/>${indent ? `<w:ind w:left="${indent}" w:hanging="260"/>` : ''}</w:pPr>${runs}</w:p>`;

function block(b) {
  if (b.title != null) return para(run(b.title, { bold: true, size: 32 }), { after: 60 });
  if (b.h != null) return para(run(b.h, { bold: true, size: 24, color: '1F3A8A' }), { before: 200, after: 60, keep: true });
  if (b.bullet != null) return para(run(`${b.mark || '•'}  ${b.bullet}`), { indent: 360, after: 40 });
  if (b.p != null) return para(run(b.p, { bold: b.bold, italic: b.italic, color: b.muted ? '666666' : undefined, size: b.muted ? 18 : 22 }));
  if (b.pagebreak) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  if (b.table) {
    const cols = b.widths || b.table[0].map(() => Math.floor(9800 / b.table[0].length));
    const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`;
    const rows = b.table.map((row, i) => `<w:tr>${row.map((cell, j) => `<w:tc><w:tcPr><w:tcW w:w="${cols[j]}" w:type="dxa"/>${i === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/>' : ''}</w:tcPr>${para(run(cell, { bold: i === 0, size: 20 }), { after: 0 })}</w:tc>`).join('')}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="${cols.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>${para('', { after: 60 })}`;
  }
  return '';
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

// ZIP « stored » : en-tête local + données pour chaque fichier, puis le répertoire central.
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF], u32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
  for (const [name, text] of files) {
    const data = enc.encode(text), fname = enc.encode(name), crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(fname.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034B50), ...common]);
    parts.push(local, fname, data);
    central.push(new Uint8Array([...u32(0x02014B50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), fname);
    offset += local.length + fname.length + data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([...u32(0x06054B50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export function buildDocx(blocks) {
  const body = blocks.map(block).join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', doc],
  ]);
}
