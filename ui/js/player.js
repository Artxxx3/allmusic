// Fila única que mistura Spotify e YouTube; cada faixa é tocada pelo backend da sua origem.
import { store } from './store.js';
import * as spotify from './spotify.js';
import * as youtube from './youtube.js';

export const P = {
  queue: [], index: -1, track: null,
  playing: false, loading: false, pos: 0, dur: 0,
  volume: store.get('volume', 0.7),
  shuffle: false, repeat: false,
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = (type, data) => listeners.forEach(fn => fn(type, data));

const backend = t => (t.src === 'yt' ? youtube : spotify);
let failures = 0;

function handlers(src) {
  const mine = () => P.track?.src === src;
  return {
    state(s) {
      if (!mine()) return;
      P.playing = !s.paused;
      P.loading = false;
      P.pos = s.pos;
      if (s.dur) P.dur = s.dur;
      if (P.playing) failures = 0;
      emit('state');
    },
    ended() {
      if (mine()) next(true);
    },
    error(message) {
      if (!mine()) return;
      emit('toast', message);
      // Pula a faixa com problema, mas não percorre a fila inteira falhando.
      if (++failures < 3) next(true);
      else stopped();
    },
  };
}
spotify.bind(handlers('sp'));
youtube.bind(handlers('yt'));

function stopped() {
  P.playing = false;
  P.loading = false;
  emit('state');
}

async function start(i) {
  const t = P.queue[i];
  if (!t) return;
  const prev = P.track;
  P.index = i;
  P.track = t;
  P.pos = 0;
  P.dur = t.dur || 0;
  P.playing = false;
  P.loading = true;
  emit('track');
  if (prev && prev.src !== t.src) backend(prev).pause();
  try {
    await backend(t).load(t, P.volume);
  } catch (e) {
    if (P.track !== t) return;
    emit('toast', e.message);
    stopped();
  }
}

export function playList(tracks, i = 0) {
  P.queue = tracks.slice();
  failures = 0;
  emit('queue');
  start(i);
}

export function jump(i) {
  failures = 0;
  start(i);
}

export function playNow(track) {
  P.queue.splice(P.index + 1, 0, track);
  failures = 0;
  emit('queue');
  start(P.index + 1);
}

export function enqueue(track, asNext = false) {
  if (asNext) P.queue.splice(P.index + 1, 0, track);
  else P.queue.push(track);
  emit('queue');
  if (!P.track) start(0);
}

export function removeFromQueue(i) {
  if (i === P.index) return;
  P.queue.splice(i, 1);
  if (i < P.index) P.index--;
  emit('queue');
}

export function toggle() {
  if (!P.track || P.loading) return;
  if (P.playing) backend(P.track).pause();
  else backend(P.track).resume();
}

export function next(auto = false) {
  const n = P.queue.length;
  if (!n) return;
  let i = P.index + 1;
  if (P.shuffle && n > 1) {
    do i = Math.floor(Math.random() * n); while (i === P.index);
  } else if (i >= n) {
    if (auto && !P.repeat) {
      P.pos = 0;
      stopped();
      return;
    }
    i = 0;
  }
  start(i);
}

export function prev() {
  if (!P.track) return;
  if (position() > 3000 || P.index === 0) seek(0);
  else start(P.index - 1);
}

export function position() {
  if (!P.track || P.loading) return P.pos;
  return backend(P.track).position();
}

export function seek(ms) {
  if (!P.track) return;
  backend(P.track).seek(ms);
  P.pos = ms;
  emit('state');
}

export function setVolume(v) {
  P.volume = v;
  store.set('volume', v);
  spotify.setVolume(v);
  youtube.setVolume(v);
}

export function setMode(key, on) {
  P[key] = on;
  emit('state');
}
