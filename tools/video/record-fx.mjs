// Grava o passeio pelas novidades (busca no YouTube, curtir pela busca, efeitos de áudio, perfil de
// artista) no ALL MUSIC aberto com --dev: os quadros vêm da janela do app e o som, da saída do
// player do YouTube já com os efeitos aplicados.
// Saída: video/public/tour2/fNNNNNN.jpg + meta.json e video/public/fx-audio.webm
// Uso: node tools/video/record-fx.mjs
//      node tools/video/record-fx.mjs --artist   (regrava só o trecho de artista e álbum, sem áudio,
//                                                  em video/public/tour2b)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect, sleep } from './cdp.mjs';

const ARTIST_ONLY = process.argv.includes('--artist');
const OUT = ARTIST_ONLY ? 'video/public/tour2b' : 'video/public/tour2';
const VIEW = { width: 1440, height: 810, deviceScaleFactor: 4 / 3 }; // 1920x1080 na captura
const QUERY = '24 songs playboi carti';

const page = await connect();
await page.send('Emulation.setDeviceMetricsOverride', { ...VIEW, mobile: false });

// ---------- cursor e clique desenhados na própria página ----------
await page.eval(`(() => {
  document.querySelector('#tour-cursor')?.remove();
  const el = document.createElement('div');
  el.id = 'tour-cursor';
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;width:26px;height:26px;transform:translate(720px,430px);will-change:transform';
  el.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3l14 8.5-6.2 1.6L9.6 19z" fill="#fff" stroke="#080808" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.append(el);
  window.__tour = {
    x: 720, y: 430,
    move(x, y, ms) { el.style.transition = 'transform ' + ms + 'ms cubic-bezier(.45,0,.2,1)'; el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; this.x = x; this.y = y; },
    ripple() {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:99998;pointer-events:none;left:' + (this.x - 8) + 'px;top:' + (this.y - 8) + 'px;width:16px;height:16px;border-radius:50%;border:3px solid #F22C3D;background:rgba(242,44,61,.35)';
      document.body.append(r);
      r.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(4.5)', opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = () => r.remove();
    },
  };
})()`);

const center = selector => page.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`);

async function waitFor(expression, timeout = 15000, on = page) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await on.eval(expression)) return true;
    await sleep(120);
  }
  throw new Error('tempo esgotado esperando: ' + expression);
}

let cursor = { x: 720, y: 430 };
async function moveTo(target, ms = 700) {
  const point = typeof target === 'string' ? await center(target) : target;
  if (!point) throw new Error('elemento não encontrado: ' + target);
  await page.eval(`__tour.move(${point.x}, ${point.y}, ${ms})`);
  // o mouse de verdade acompanha, para os estados de hover aparecerem
  for (let i = 1; i <= 6; i++) {
    await sleep(ms / 6);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cursor.x + (point.x - cursor.x) * i / 6, y: cursor.y + (point.y - cursor.y) * i / 6 });
  }
  cursor = point;
  await sleep(160);
}

async function click(target, ms) {
  await moveTo(target, ms);
  await page.eval('__tour.ripple()');
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cursor.x, y: cursor.y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cursor.x, y: cursor.y, button: 'left', clickCount: 1 });
}

async function typeText(text, delay = 80) {
  for (const ch of text) {
    await page.send('Input.insertText', { text: ch });
    await sleep(delay + Math.random() * 50);
  }
}

/** Arrasta um controle do painel de efeitos até `to`, com o cursor acompanhando. */
async function drag(knob, to, ms = 1800) {
  const selector = `#fx-panel [data-knob=${knob}]`;
  const box = await page.eval(`(() => { const el = document.querySelector('${selector}'); const r = el.getBoundingClientRect(); return { left: r.left, width: r.width, y: r.top + r.height / 2, value: +el.value }; })()`);
  const at = value => ({ x: Math.round(box.left + box.width * value / 100), y: Math.round(box.y) });
  await moveTo(at(box.value));
  await page.eval('__tour.ripple()');
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const value = Math.round(box.value + (to - box.value) * i / steps);
    const point = at(value);
    await page.eval(`(() => { __tour.move(${point.x}, ${point.y}, ${ms / steps}); const el = document.querySelector('${selector}'); el.value = ${value}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(ms / steps);
  }
  cursor = at(to);
}

const playing = `document.querySelector('#play-icon').getAttribute('href').endsWith('pause')`;
const quiet = selector => page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

// ---------- preparação (fora da gravação) ----------
const before = await page.eval(`({ volume: localStorage.getItem('am.volume'), side: localStorage.getItem('am.side'), library: localStorage.getItem('am.library') })`);
await page.eval(`(() => {
  if (document.body.classList.contains('lib-collapsed')) document.querySelector('#lib-toggle').click();
  if (document.body.classList.contains('side-collapsed')) document.querySelector('#side-open').click();
  const v = document.querySelector('#volume'); v.value = 15; v.dispatchEvent(new Event('input'));
  document.querySelector('#search').value = '';
})()`);

await waitFor(`!document.body.classList.contains('gated') && !!document.querySelector('.tab[data-view=yt]')`, 30000);
// qual resultado tocar: o que tem o nome da música e dura o bastante para a gravação inteira
const results = await page.eval(`fetch('/api/ytsearch?q=' + encodeURIComponent(${JSON.stringify(QUERY)})).then(r => r.json())`);
const top = results.slice(0, 6);
let pick = top.findIndex(v => /24 songs/i.test(v.title) && v.seconds >= 140);
if (pick < 0) pick = Math.max(0, top.findIndex(v => /24 songs/i.test(v.title)));
console.log('resultado escolhido:', pick, top[pick]?.title, top[pick]?.seconds + 's');

// Efeito desligado antes de qualquer vídeo tocar: o grafo de áudio só pode nascer depois do grampo.
await quiet('#fx');
await quiet('#fx-panel [data-fx=""]');
await quiet('#fx');

// Aquecimento: toca a música pela busca para o iframe do player existir, grampeia a saída de áudio
// dele e liga e desliga um efeito, o que faz o app montar o grafo de áudio já com o grampo.
const fill = text => page.eval(`(() => { const i = document.querySelector('#search'); i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await fill(QUERY);
await waitFor(`!document.querySelector('#search-drop').hidden`);
await quiet('#search-drop [data-source=yt]');
await waitFor(`!!document.querySelector('#search-drop .drop-item img[src*="ytimg"]')`);
// a gravação mostra a música sendo curtida: se já estiver, descurte antes
if (!ARTIST_ONLY && await page.eval(`document.querySelector('#search-drop .drop-item[data-i="${pick}"] [data-like]').classList.contains('liked')`)) {
  await quiet(`#search-drop .drop-item[data-i="${pick}"] [data-like]`);
  await sleep(400);
}
await quiet(`#search-drop .drop-item[data-i="${pick}"] .lib-text`);
let frame = null;
for (let i = 0; i < 60 && !frame; i++) {
  await sleep(500);
  frame = await connect(t => t.url.includes('youtube.com/embed')).catch(() => null);
}
if (!frame) throw new Error('o player do YouTube não abriu');
await waitFor(`(document.querySelector('video')?.currentTime || 0) > 0.5`, 30000, frame);
await frame.eval(`(() => {
  if (window.__tapInstalled) return;
  window.__tapInstalled = true;
  window.__tapped = [];
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode) {
      window.__ctx = this.context;
      window.__tapped.push(this.constructor.name);
      window.__tap ||= this.context.createMediaStreamDestination();
      connect.call(this, window.__tap);
    }
    return connect.call(this, target, ...rest);
  };
})()`);
// efeitos nos padrões: Abafado em "Next room", 8D em "Classic", e por fim desligado
await quiet('#fx');
await quiet('#fx-panel [data-gear=muffled]');
await quiet('#fx-panel [data-variant=room]');
await quiet('#fx-panel [data-back]');
await quiet('#fx-panel [data-gear="8d"]');
await quiet('#fx-panel [data-variant=classic]');
await quiet('#fx-panel [data-back]');
await sleep(600);
await quiet('#fx-panel [data-fx=""]');
await quiet('#fx');
// a saída dos efeitos (o limitador) precisa ter sido grampeada; se o grafo já existia, não foi
if (!ARTIST_ONLY) await waitFor(`!!window.__tap && window.__tapped.includes('DynamicsCompressorNode')`, 5000, frame)
  .catch(() => { throw new Error('o grafo de áudio já existia antes do grampo: feche e abra o app de novo'); });
if (!ARTIST_ONLY && await page.eval(playing)) await quiet('#play');
// com o grafo montado dá para calar os alto-falantes e gravar em volume cheio
const silent = !ARTIST_ONLY && await frame.eval(`window.__ctx.setSinkId({ type: 'none' }).then(() => true, () => false)`);
await page.eval(`(() => { const v = document.querySelector('#volume'); v.value = ${silent ? 100 : 20}; v.dispatchEvent(new Event('input')); })()`);
console.log(silent ? 'gravando sem som nos alto-falantes' : 'não deu para calar os alto-falantes: gravando em volume baixo');

// a busca começa na aba Spotify
await fill('aa');
await waitFor(`!document.querySelector('#search-drop').hidden`);
await quiet('#search-drop [data-source=sp]');
await sleep(400);
await page.eval(`(() => { const i = document.querySelector('#search'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); document.querySelector('#home').click(); })()`);

await sleep(1500);

// ---------- gravação ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const frames = [];
const marks = {};
let t0 = 0;
page.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  if (!t0) t0 = metadata.timestamp;
  const file = `f${String(frames.length + 1).padStart(6, '0')}.jpg`;
  writeFileSync(`${OUT}/${file}`, Buffer.from(data, 'base64'));
  frames.push({ t: +(metadata.timestamp - t0).toFixed(3), file });
  page.send('Page.screencastFrameAck', { sessionId });
});
const mark = name => { marks[name] = +(Date.now() / 1000 - t0).toFixed(3); console.log(marks[name].toFixed(1) + 's', name); };

await page.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await page.eval('__tour.move(721, 431, 50)'); // força o primeiro quadro
await sleep(600);
const audioStartedAt = ARTIST_ONLY ? 0 : await frame.eval(`new Promise(resolve => {
  window.__chunks = [];
  window.__rec = new MediaRecorder(window.__tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 });
  window.__rec.ondataavailable = e => window.__chunks.push(e.data);
  window.__rec.onstart = () => resolve(Date.now());
  window.__rec.start(1000);
})`);

let audio = null;
try {
  mark('start');
  await sleep(ARTIST_ONLY ? 1000 : 1800);
  if (!ARTIST_ONLY) {

  // busca: Spotify primeiro, depois a aba YouTube
  mark('search');
  await click('#search');
  await typeText(QUERY);
  await waitFor(`document.querySelectorAll('#search-drop .drop-item').length > 0`);
  mark('results-spotify');
  await sleep(2200);
  mark('youtube-tab');
  await click('#search-drop [data-source=yt]');
  await waitFor(`!!document.querySelector('#search-drop .drop-item img[src*="ytimg"]')`);
  mark('results-youtube');
  await sleep(2600);

  // curtir pelo resultado e tocar
  mark('like');
  await click(`#search-drop .drop-item[data-i="${pick}"] [data-like]`);
  await sleep(2000);
  mark('play');
  await click(`#search-drop .drop-item[data-i="${pick}"] .lib-text`);
  await waitFor(playing, 30000);
  await waitFor(`!document.querySelector('.ad-showing') && (document.querySelector('video')?.currentTime || 0) > 0.3`, 90000, frame);
  mark('plain');
  await sleep(7000);

  // efeitos: abafado e suas variações
  mark('fx-open');
  await click('#fx');
  await sleep(1800);
  mark('muffled');
  await click('#fx-panel [data-fx=muffled]');
  await sleep(5500);
  mark('muffled-tune');
  await click('#fx-panel [data-gear=muffled]');
  await sleep(2200);
  for (const [variant, ms] of [['soft', 4800], ['voice', 4800], ['water', 5200]]) {
    mark('muffled-' + variant);
    await click(`#fx-panel [data-variant=${variant}]`);
    await sleep(ms);
  }
  mark('muffled-drag');
  await drag('damp', 38);
  await sleep(3200);
  mark('muffled-back');
  await click('#fx-panel [data-back]');
  await sleep(1200);

  // 8D e suas variações
  mark('8d');
  await click('#fx-panel [data-fx="8d"]');
  await sleep(8500);
  mark('8d-tune');
  await click('#fx-panel [data-gear="8d"]');
  await sleep(1800);
  for (const [variant, ms] of [['hop', 7500], ['fast', 5500], ['hall', 5500]]) {
    mark('8d-' + variant);
    await click(`#fx-panel [data-variant=${variant}]`);
    await sleep(ms);
  }
  mark('8d-back');
  await click('#fx-panel [data-back]');
  await sleep(1000);
  mark('off');
  await click('#fx-panel [data-fx=""]');
  await sleep(2600);
  mark('fx-close');
  await click('#fx');
  await sleep(1000);
  }

  // perfil de artista e álbum (Spotify)
  mark('artist-search');
  await click('#search');
  await typeText('playboi carti');
  await waitFor(`document.querySelectorAll('#search-drop .drop-item').length > 0`);
  await sleep(900);
  await click('#search-drop [data-source=sp]');
  await waitFor(`!!document.querySelector('#search-drop .drop-item img:not([src*="ytimg"])')`);
  await sleep(1400);
  mark('all-results');
  await click('#search-drop [data-all]');
  await waitFor(`!!document.querySelector('#list .row .a .link')`);
  await sleep(1800);
  mark('artist');
  await click('#list .row .a .link');
  await waitFor(`!!document.querySelector('#list .hero h1') && document.querySelectorAll('#list .row').length > 0`, 25000);
  mark('artist-open');
  await sleep(3200);
  mark('discography');
  await page.eval(`(() => { const list = document.querySelector('#list'); const sec = [...list.querySelectorAll('.sec')].at(-1); list.scrollTo({ top: sec.offsetTop - list.offsetTop - 16, behavior: 'smooth' }); })()`);
  await sleep(3200);
  mark('album');
  await click('#list .album');
  await waitFor(`!!document.querySelector('#list .hero small') && document.querySelectorAll('#list .row').length > 0`, 25000);
  mark('album-open');
  await sleep(3600);

  mark('back-home');
  await click('#home');
  await sleep(3000);
  mark('end');

  if (!ARTIST_ONLY) audio = await frame.eval(`new Promise(resolve => {
    window.__rec.onstop = () => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(new Blob(window.__chunks, { type: 'audio/webm' }));
    };
    window.__rec.stop();
  })`);
} finally {
  await page.send('Page.stopScreencast').catch(() => { });
  // ---------- restaura o que foi alterado ----------
  await page.eval(`(() => {
    if (${playing}) document.querySelector('#play').click();
    document.querySelector('#tour-cursor')?.remove();
    const v = document.querySelector('#volume'); v.value = Math.round(${JSON.stringify(before.volume)} * 100) || 70; v.dispatchEvent(new Event('input'));
    if (${JSON.stringify(before.library)} === 'false' && !document.body.classList.contains('lib-collapsed')) document.querySelector('#lib-close').click();
    if (${JSON.stringify(before.side)} === 'false' && !document.body.classList.contains('side-collapsed')) document.querySelector('#side-close').click();
    document.querySelector('#search').value = '';
    document.querySelector('#search-drop').hidden = true;
    document.querySelector('#fx-panel').hidden = true;
  })()`).catch(() => { });
  await frame.eval(`window.__ctx?.setSinkId('')`).catch(() => { });
  await page.send('Emulation.clearDeviceMetricsOverride').catch(() => { });
  if (audio) writeFileSync('video/public/fx-audio.webm', Buffer.from(audio, 'base64'));
  writeFileSync(`${OUT}/meta.json`, JSON.stringify({
    duration: frames.at(-1)?.t ?? 0,
    audioStart: +(audioStartedAt / 1000 - t0).toFixed(3), // instante do passeio em que o áudio começa
    track: top[pick]?.title,
    marks, frames,
  }));
  console.log(`quadros: ${frames.length}, duração: ${frames.at(-1)?.t ?? 0}s, áudio: ${audio ? Math.round(audio.length * 0.75 / 1024) + ' KB' : 'não gravado'}`);
  frame.close();
  page.close();
}
