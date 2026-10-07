// Spotify pelo motor nativo (engine/, baseado no librespot): login, biblioteca e reprodução.
// A página fala com ele por mensagens que o app hospedeiro repassa (linhas JSON).

const host = window.chrome?.webview;

let status = 'starting';
let handlers = { status() { }, notice() { } };
let cb = { state() { }, ended() { }, error() { } };
let seq = 0;
const waiting = new Map();
let last = null; // última posição informada pelo motor + instante em que chegou
let dur = 0;
let loginUrl = ''; // endereço do login em andamento, para reabrir a aba

export const isConnected = () => status === 'ready';

const send = command => host?.postMessage({ type: 'engine', value: JSON.stringify(command) });
// Comandos do player só fazem sentido com a sessão aberta (no modo sem Spotify o motor os recusaria).
const control = command => { if (isConnected()) send(command); };

function ask(command) {
  return new Promise((resolve, reject) => {
    if (!isConnected()) return reject(new Error('Spotify desconectado'));
    const req = ++seq;
    // Sem resposta em 25 s, desiste: uma lista nunca fica presa em "carregando".
    const timer = setTimeout(() => {
      if (waiting.delete(req)) reject(new Error('O Spotify não respondeu'));
    }, 25_000);
    waiting.set(req, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    send({ req, ...command });
  });
}

function failWaiting(reason) {
  for (const { reject } of waiting.values()) reject(new Error(reason));
  waiting.clear();
}

function mark(pos, paused) {
  last = { pos, paused, at: performance.now() };
  cb.state({ paused, pos, dur });
}

function onEvent(ev) {
  switch (ev.ev) {
    case 'result': {
      const pending = waiting.get(ev.req);
      waiting.delete(ev.req);
      if (!pending) return;
      if (ev.error) pending.reject(new Error('Spotify: ' + ev.error));
      else pending.resolve(ev.data);
      return;
    }
    case 'ready':
      // Motor reiniciado ou reconectado: o que estava pendente no anterior não volta mais.
      failWaiting('O Spotify reconectou, tente de novo');
      status = 'ready';
      loginUrl = '';
      return handlers.status('ready', ev.user);
    case 'login_url':
      loginUrl = ev.url;
      return;
    case 'need_login':
    case 'gone':
      status = ev.ev;
      last = null;
      failWaiting('Spotify desconectado');
      return handlers.status(ev.ev, ev.msg);
    case 'login_started':
      return handlers.status('login_started');
    case 'error':
      return handlers.notice(ev.msg);
    case 'track':
      dur = ev.dur;
      return;
    case 'playing':
      return mark(ev.pos, false);
    case 'paused':
      return mark(ev.pos, true);
    case 'position':
      if (last) mark(ev.pos, last.paused);
      return;
    case 'ended':
      last = null;
      return cb.ended();
    case 'unavailable':
      return cb.error('Esta faixa não está disponível no Spotify');
  }
}

host?.addEventListener('message', e => {
  if (e.data?.type !== 'engine') return;
  let ev;
  try { ev = JSON.parse(e.data.value); } catch { return; }
  onEvent(ev);
});

/** Liga o motor. `status(estado, usuário)` recebe: ready, need_login, login_started, gone, unavailable. */
export function start(h) {
  handlers = h;
  if (host) host.postMessage({ type: 'engine-start' });
  else handlers.status('unavailable');
}

export const isGone = () => status === 'gone';
/** Pede ao app para iniciar o motor de novo depois de uma queda. */
export const restart = () => host?.postMessage({ type: 'engine-restart' });
export function login() {
  // Login já em andamento: só reabre a aba do navegador.
  if (loginUrl && status !== 'ready') return void host?.postMessage({ type: 'open', value: loginUrl });
  send({ cmd: 'login' });
}
export const logout = () => send({ cmd: 'logout' });

// ---------- biblioteca ----------
// liked/playlist/search devolvem só referências `{uri, at}`; `tracks` troca uris pelos dados da faixa.

export const profile = () => ask({ cmd: 'profile' });
export const liked = () => ask({ cmd: 'liked' });
export const playlists = () => ask({ cmd: 'playlists' });
export const playlist = id => ask({ cmd: 'playlist', id });
export const search = q => ask({ cmd: 'search', q });
export const tracks = uris => ask({ cmd: 'tracks', uris });
export const like = (uri, on) => ask({ cmd: 'like', uri, on });

// ---------- reprodução (mesma interface do youtube.js) ----------

export const bind = h => { cb = h; };

export async function load(track, volume) {
  if (!isConnected()) throw new Error('Spotify desconectado');
  last = null;
  dur = track.dur || 0;
  control({ cmd: 'volume', v: volume });
  control({ cmd: 'load', uri: track.uri });
}

export const pause = () => { control({ cmd: 'pause' }); };
export const resume = () => { control({ cmd: 'play' }); };
export const setVolume = v => { control({ cmd: 'volume', v }); };

export function seek(ms) {
  control({ cmd: 'seek', ms: Math.round(ms) });
  if (last) last = { ...last, pos: ms, at: performance.now() };
}

export function position() {
  if (!last) return 0;
  return last.paused ? last.pos : Math.min(dur || Infinity, last.pos + (performance.now() - last.at));
}
