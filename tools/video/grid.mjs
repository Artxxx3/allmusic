// Junta imagens numa grade: node tools/video/grid.mjs <saida.jpg> <colunas> <largura> <altura> <arquivos...>
import sharp from 'sharp';
const [out, colsArg, wArg, hArg, ...files] = process.argv.slice(2);
const cols = +colsArg, W = +wArg, H = +hArg;
const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(W, H, { fit: 'contain', background: '#222' }).jpeg().toBuffer(), left: (i % cols) * W, top: Math.floor(i / cols) * H })));
await sharp({ create: { width: cols * W, height: Math.ceil(files.length / cols) * H, channels: 3, background: '#222' } }).composite(tiles).jpeg({ quality: 82 }).toFile(out);
