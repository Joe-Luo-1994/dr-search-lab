export function syntheticPdf(text) {
  if (!/^[ -~\n]+$/u.test(text)) {
    throw new Error('EXPECTED_PRINTABLE_ASCII_PDF_TEXT');
  }
  const escapedLines = text.split('\n').map(line =>
    '(' + line.replace(/[()\\]/gu, character => '\\' + character) + ') Tj T*');
  const stream = [
    'BT', '/F1 14 Tf', '18 TL', '64 736 Td', ...escapedLines, 'ET', '',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let content = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = content.length;
    content += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return offset;
  });
  const startXref = content.length;
  const xref = offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  content += 'xref\n0 6\n0000000000 65535 f \n' + xref +
    'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + startXref + '\n%%EOF\n';
  return Buffer.from(content, 'ascii');
}
