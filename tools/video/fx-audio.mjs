// Prepara o áudio gravado por record-fx.mjs para o vídeo: normaliza o volume e mede, a cada quadro
// de 30 fps, o nível e o lado em que o som está (para as animações acompanharem os efeitos).
// Uso: node tools/video/fx-audio.mjs <wav pcm 16 bits estéreo 48 kHz>
// Saída: video/public/fx-audio.wav e video/public/tour2/audio.json
import { readFileSync, writeFileSync } from 'node:fs';

const RATE = 48000;
const wav = readFileSync(process.argv[2]);
const start = wav.indexOf('data') + 8;
const pcm = wav.subarray(start, start + ((wav.length - start) & ~3));
const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length));

let peak = 1;
for (const v of samples) if (Math.abs(v) > peak) peak = Math.abs(v);
const gain = Math.min(12, 29000 / peak);
for (let i = 0; i < samples.length; i++) samples[i] = Math.round(samples[i] * gain);

const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync('video/public/fx-audio.wav', Buffer.concat([header, Buffer.from(samples.buffer)]));

const step = RATE / 30;
const level = [];
const pan = [];
for (let f = 0; (f + 1) * step * 2 <= samples.length; f++) {
  let left = 0, right = 0;
  for (let i = Math.floor(f * step); i < Math.floor((f + 1) * step); i++) {
    left += samples[i * 2] ** 2;
    right += samples[i * 2 + 1] ** 2;
  }
  left = Math.sqrt(left / step) / 32768;
  right = Math.sqrt(right / step) / 32768;
  level.push(+Math.max(left, right).toFixed(3));
  pan.push(left + right > 0.004 ? +((right - left) / (right + left)).toFixed(3) : 0);
}
writeFileSync('video/public/tour2/audio.json', JSON.stringify({ level, pan }));
console.log(`pico ${peak}, ganho ${gain.toFixed(2)}x, ${level.length} quadros (${(level.length / 30).toFixed(1)} s)`);
