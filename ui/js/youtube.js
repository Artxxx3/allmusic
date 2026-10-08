// YouTube pelo player oficial (IFrame API), usado só pelo áudio. Carregado na primeira vez que um vídeo toca.

let yt = null;
let ready = null;
let cb = { state() { }, ended() { }, error() { } };

export const bind = handlers => { cb = handlers; };

export function parseYouTubeId(text) {
  const m = String(text).trim().match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/i);
  return m ? m[1] : null;
}

/** Faixa a partir de um vídeo: separa artista e música do título quando dá. */
function videoTrack(id, title, channel, dur = 0) {
  const track = {
    src: 'yt', id,
    title: title || 'Vídeo do YouTube',
    artist: String(channel || 'YouTube').replace(/ - Topic$/, ''),
    art: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    artBig: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    dur,
  };
  // "Artista - Música (Official Video)" é o padrão mais comum dos títulos.
  const parts = String(title || '').split(/\s[-–—]\s/);
  if (parts.length >= 2) {
    track.artist = parts[0].trim();
    track.title = parts.slice(1).join(' - ').trim();
  }
  return track;
}

/** Busca vídeos no YouTube (o app lê a página de resultados; não há API sem chave). */
export async function searchYouTube(query) {
  const r = await fetch('/api/ytsearch?q=' + encodeURIComponent(query)).catch(() => null);
  if (!r?.ok) throw new Error('A busca do YouTube não respondeu');
  return (await r.json()).map(v => videoTrack(v.id, v.title, v.channel, v.seconds * 1000));
}

export async function fetchYouTubeTrack(id) {
  const r = await fetch('/api/oembed?id=' + id).catch(() => null);
  if (r?.status === 401 || r?.status === 403)
    throw new Error('Este vídeo não permite tocar fora do YouTube');
  if (r?.status === 404 || r?.status === 400)
    throw new Error('Vídeo não encontrado');
  if (!r?.ok) return videoTrack(id);
  const info = await r.json();
  return videoTrack(id, info.title, info.author_name);
}

function ensure() {
  ready ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => {
      yt = new window.YT.Player('yt-player', {
        width: 200,
        height: 113,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, origin: location.origin },
        events: { onReady: () => { sendFx(); resolve(); }, onStateChange, onError },
      });
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ready = null; reject(new Error('Não deu para carregar o player do YouTube')); };
    document.head.append(s);
  });
  return ready;
}

// O efeito é aplicado dentro do iframe do player, por um script que o app injeta lá (yt-fx.js).
let fx = { name: '' };
const sendFx = () => yt?.getIframe?.()?.contentWindow?.postMessage({ allmusicFx: fx }, 'https://www.youtube.com');

/** Efeito de áudio: '' (nenhum), 'muffled' ou '8d'; `params` são os ajustes dele. */
export function setFx(name, params) {
  fx = { name, ...params };
  sendFx();
}

const snapshot = paused => ({ paused, pos: yt.getCurrentTime() * 1000, dur: yt.getDuration() * 1000 });

function onStateChange(e) {
  if (e.data === 1) cb.state(snapshot(false));
  else if (e.data === 2) cb.state(snapshot(true));
  else if (e.data === 0) cb.ended();
}

function onError(e) {
  cb.error(e.data === 101 || e.data === 150
    ? 'O dono deste vídeo bloqueou a reprodução fora do YouTube'
    : e.data === 100 ? 'Vídeo removido ou privado' : 'Erro ao tocar o vídeo do YouTube');
}

export async function load(track, volume) {
  await ensure();
  yt.setVolume(volume * 100);
  yt.loadVideoById(track.id);
  sendFx();
}

export const pause = () => { yt?.pauseVideo?.(); };
export const resume = () => { yt?.playVideo?.(); };
export const seek = ms => { yt?.seekTo?.(ms / 1000, true); };
export const setVolume = v => { yt?.setVolume?.(v * 100); };
export const position = () => (yt?.getCurrentTime ? yt.getCurrentTime() * 1000 : 0);
