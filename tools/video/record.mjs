// Grava um passeio pelo ALL MUSIC (aberto com --dev) direto da janela do app, quadro a quadro.
// Saída: video/public/tour/fNNNNNN.jpg + meta.json (tempo de cada quadro e marcações das ações).
// Uso: node tools/video/record.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect, sleep } from './cdp.mjs';

const OUT = 'video/public/tour';
const VIEW = { width: 1440, height: 810, deviceScaleFactor: 4 / 3 }; // 1920x1080 na captura
const YOUTUBE_LINK = 'https://www.youtube.com/watch?v=t53IG6RWKwU';  // já está nas curtidas: não cria nada novo

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

async function waitFor(expression, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await page.eval(expression)) return true;
    await sleep(120);
  }
  throw new Error('tempo esgotado esperando: ' + expression);
}

let cursor = { x: 720, y: 430 };
async function moveTo(target, ms = 650) {
  const point = typeof target === 'string' ? await center(target) : target;
  if (!point) throw new Error('elemento não encontrado: ' + target);
  await page.eval(`__tour.move(${point.x}, ${point.y}, ${ms})`);
  // o mouse de verdade acompanha, para os estados de hover aparecerem
  for (let i = 1; i <= 6; i++) {
    await sleep(ms / 6);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cursor.x + (point.x - cursor.x) * i / 6, y: cursor.y + (point.y - cursor.y) * i / 6 });
  }
  cursor = point;
  await sleep(140);
}

async function click(target, ms) {
  await moveTo(target, ms);
  await page.eval('__tour.ripple()');
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cursor.x, y: cursor.y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cursor.x, y: cursor.y, button: 'left', clickCount: 1 });
}

async function typeText(text, delay = 75) {
  for (const ch of text) {
    await page.send('Input.insertText', { text: ch });
    await sleep(delay + Math.random() * 50);
  }
}

const playing = `document.querySelector('#play-icon').getAttribute('href').endsWith('pause')`;
const title = () => page.eval(`document.querySelector('#pb-title').textContent`);

// ---------- preparação (fora da gravação) ----------
const before = await page.eval(`({ volume: localStorage.getItem('am.volume'), side: localStorage.getItem('am.side'), library: localStorage.getItem('am.library') })`);
await page.eval(`(() => {
  if (document.body.classList.contains('lib-collapsed')) document.querySelector('#lib-toggle').click();
  if (document.body.classList.contains('side-collapsed')) document.querySelector('#side-open').click();
  const v = document.querySelector('#volume'); v.value = 22; v.dispatchEvent(new Event('input'));
  if (${playing}) document.querySelector('#play').click();
  document.querySelector('#home').click();
  document.querySelector('#search').value = '';
})()`);
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

try {
  mark('home');
  await sleep(1600);
  await moveTo('#home-view .stats', 800);
  await sleep(900);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 600, deltaX: 0, deltaY: 520 });
  mark('home-scroll');
  await sleep(2200);

  mark('liked');
  await click('.tab[data-view="all"]');
  await waitFor(`document.querySelectorAll('#list .row').length > 5`);
  await sleep(1400);

  mark('play-spotify');
  await click('#list .row:nth-child(3) .t');
  await waitFor(playing);
  console.log('   tocando:', await title());
  await sleep(3200);

  mark('search');
  await click('#search');
  await sleep(350);
  await typeText('frank ocean');
  await waitFor(`document.querySelectorAll('#search-drop .drop-item').length > 0`);
  mark('search-results');
  await sleep(1500);
  await click('#search-drop .drop-item:nth-child(2)');
  await waitFor(playing);
  console.log('   tocando:', await title());
  mark('search-play');
  await sleep(2800);

  mark('paste');
  await click('#search');
  await sleep(300);
  await page.send('Input.insertText', { text: YOUTUBE_LINK });
  await waitFor(`document.querySelector('.tab.on')?.dataset.view === 'yt' && ${playing}`, 25000);
  console.log('   tocando:', await title());
  mark('youtube-play');
  await moveTo('#list .row.on .t', 700);
  await sleep(3600);

  mark('queue');
  await click('.tab[data-view="all"]');
  await waitFor(`document.querySelectorAll('#list .row').length > 5`);
  await sleep(1000);
  await click('#list .row:nth-child(4) .t');
  await waitFor(playing);
  console.log('   tocando:', await title());
  await sleep(1800);
  mark('next');
  await click('#next');
  await sleep(2800);

  mark('back-home');
  await click('#home');
  await sleep(2400);
  mark('end');
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
  })()`).catch(() => { });
  await page.send('Emulation.clearDeviceMetricsOverride').catch(() => { });
  writeFileSync(`${OUT}/meta.json`, JSON.stringify({ duration: frames.at(-1)?.t ?? 0, marks, frames }));
  console.log(`quadros: ${frames.length}, duração: ${frames.at(-1)?.t ?? 0}s`);
  page.close();
}
