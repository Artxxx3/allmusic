// Folhas de contato da gravação: node tools/video/sheet.mjs <pasta> <passo> [colunas] [linhas]
// Lê <pasta>/fr/fNNNN.jpg (2 quadros por segundo) e grava <pasta>/sheetNN.jpg com o tempo em cada quadro.
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
const [dir, stepArg, colsArg, rowsArg, fromArg, toArg] = process.argv.slice(2);
const step = +stepArg || 4, cols = +colsArg || 3, rows = +rowsArg || 3, W = 1920 / cols, H = Math.round(W * 9 / 16);
const from = +fromArg || 0, to = +toArg || 1e9;
const files = readdirSync(dir + '/fr').filter(f => f.endsWith('.jpg')).sort()
  .filter(f => { const s = (parseInt(f.slice(1, 5), 10) - 1) / 2; return s >= from && s <= to; })
  .filter((_, i) => i % step === 0);
for (let p = 0; p * cols * rows < files.length; p++) {
  const tiles = await Promise.all(files.slice(p * cols * rows, (p + 1) * cols * rows).map(async (f, i) => {
    const sec = (parseInt(f.slice(1, 5), 10) - 1) / 2;
    const label = Buffer.from(`<svg width="${W}" height="${H}"><rect width="120" height="40" fill="black" opacity=".8"/><text x="8" y="29" font-size="26" font-family="Arial" fill="yellow">${sec.toFixed(1)}s</text></svg>`);
    return { input: await sharp(`${dir}/fr/${f}`).resize(W, H).composite([{ input: label }]).jpeg().toBuffer(), left: (i % cols) * W, top: Math.floor(i / cols) * H };
  }));
  await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#000' } }).composite(tiles).jpeg({ quality: 72 }).toFile(`${dir}/sheet${String(p).padStart(2, '0')}.jpg`);
}
console.log('folhas:', Math.ceil(files.length / (cols * rows)));
