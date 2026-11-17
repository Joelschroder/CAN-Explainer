// Gör en sidfil utan <html>/<head>/<body> av index.html, för publicering som Claude-artifact.
// Övriga filer (css/, js/, vendor/) publiceras bredvid sidan med samma sökvägar.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const between = (a, b) => {
  const start = html.indexOf(a);
  const end = html.indexOf(b);
  if (start < 0 || end < 0) throw new Error(`Hittar inte markörerna ${a} / ${b} i index.html`);
  return html.slice(start + a.length, end).trim();
};
const page = `${between('<!-- page:start -->', '<!-- head:end -->')}\n${between('<!-- body:start -->', '<!-- body:end -->')}\n`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/can-bussen.html', import.meta.url), page);
console.log(`dist/can-bussen.html (${page.length} tecken)`);
