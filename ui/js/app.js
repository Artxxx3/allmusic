import { store, keyOf } from './store.js';
import { P, onChange, playList, jump, playNow, enqueue, removeFromQueue, toggle, next, prev, position, seek, setVolume, setMode } from './player.js';
import * as S from './spotify.js';
import { parseYouTubeId, fetchYouTubeTrack, searchYouTube, setFx as setYouTubeFx } from './youtube.js';
import { LANGUAGES, lang, setLanguage, t, tn, translateDom } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const host = window.chrome?.webview;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="i ${cls}"><use href="/icons.svg#${name}"/></svg>`;

function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = t(message);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}
const fail = e => toast(e?.message || String(e));

// ---------- dados locais ----------

const ytList = () => store.get('yt', []);
const localPlaylists = () => store.get('playlists', []);
const saveLocal = () => store.set('playlists', localPlaylists());
const liked = new Set(); // uris curtidas no Spotify

const isLiked = t => (t.src === 'yt' ? ytList().some(x => x.id === t.id) : liked.has(t.uri));

// Lista do Spotify carregada aos poucos: `loadRefs` traz todas as referências {uri, at} de uma vez
// (é barato) e `more` busca os dados das próximas 50 faixas, virando null no fim.
function lazy(title, loadRefs, extra = {}) {
  const v = { title, tracks: [], ...extra };
  let refs = null;
  let offset = 0;
  v.more = async () => {
    refs ??= await loadRefs();
    const page = refs.slice(offset, offset + 50);
    if (page.length) {
      const addedAt = new Map(page.map(r => [r.uri, r.at]));
      const found = await S.tracks(page.map(r => r.uri));
      v.tracks.push(...found.map(t => ({ ...t, at: addedAt.get(t.uri) || undefined })));
    }
    offset += page.length;
    if (offset >= refs.length) v.more = null;
  };
  return v;
}

// As curtidas vêm inteiras numa chamada só; servem tanto para a lista quanto para os corações.
let likedRefsPromise = null;
function likedRefs() {
  likedRefsPromise ??= S.liked().then(refs => {
    liked.clear();
    refs.forEach(r => liked.add(r.uri));
    return refs.sort((a, b) => (b.at || 0) - (a.at || 0));
  }).catch(e => {
    likedRefsPromise = null;
    throw e;
  });
  return likedRefsPromise;
}

// ---------- telas (o que a lista central mostra) ----------

const views = {
  home: { title: 'Início', tracks: [], home: true },
  queue: { title: 'Fila', get tracks() { return P.queue; }, removable: true, empty: 'A fila está vazia. Toque qualquer música para começar.' },
  all: null,
  liked: null,
  top: null,
  yt: { title: 'Curtidas do YouTube', get tracks() { return ytList(); }, removable: true, empty: 'Cole um link do YouTube na busca lá em cima para adicionar uma música.' },
  ctx: null,
};
let view = 'home';
let loadingView = false;

// Sem Spotify conectado a lista existe, mas vazia e sem nada para carregar.
const likedView = () => (S.isConnected()
  ? lazy('Curtidas do Spotify', likedRefs, { empty: 'Você ainda não curtiu nenhuma música.' })
  : { title: 'Curtidas do Spotify', tracks: [], empty: 'Conecte o Spotify pelo ícone de conta para ver suas curtidas.' });

// Curtidas do Spotify e do YouTube juntas, da mais recente para a mais antiga.
function allLikedView() {
  let memo = [];
  let signature = '';
  return {
    title: 'Todas as curtidas',
    empty: 'Você ainda não curtiu nenhuma música.',
    get more() { return views.liked.more; },
    get pending() { return !views.liked.tracks.length; },
    get tracks() {
      const sp = views.liked.tracks;
      const yt = ytList();
      const now = `${sp.length}:${yt.length}:${!!views.liked.more}`;
      if (now !== signature) {
        // Enquanto o Spotify não carregou tudo, vídeos mais antigos que a última faixa carregada
        // ficam de fora, para não mudarem de posição quando a próxima página chegar.
        const floor = views.liked.more && sp.length ? sp.at(-1).at || 0 : 0;
        memo = [...sp, ...yt.filter(t => (t.at || 0) >= floor)].sort((a, b) => (b.at || 0) - (a.at || 0));
        signature = now;
      }
      return memo;
    },
  };
}

// Contagem feita pelo próprio ALL MUSIC (o Spotify não informa quantas vezes cada faixa tocou).
const plays = () => store.get('plays', {});
const playCount = t => plays()[keyOf(t)]?.n || 0;
let playsVersion = 0;

function topView() {
  let memo = [];
  let version = -1;
  return {
    title: 'Mais ouvidas',
    showPlays: true,
    empty: 'O que você ouvir no ALL MUSIC aparece aqui, com a contagem.',
    get tracks() {
      if (version !== playsVersion) {
        memo = Object.values(plays()).sort((a, b) => b.n - a.n).map(p => p.t);
        version = playsVersion;
      }
      return memo;
    },
  };
}

// Conta uma reprodução quando a faixa tocou de verdade: 30 s, ou metade dela se for curta.
let heard = null;

function trackHeard() {
  const now = performance.now();
  if (heard && heard.since) {
    heard.ms += now - heard.since;
    heard.since = 0;
  }
  if (heard && !heard.counted && heard.ms >= Math.min(30_000, (heard.track.dur || 60_000) / 2)) {
    heard.counted = true;
    const all = plays();
    const key = keyOf(heard.track);
    all[key] = { n: (all[key]?.n || 0) + 1, t: heard.track };
    const log = store.get('history', []);
    log.push({ k: key, at: Date.now() });
    store.set('history', log.slice(-5000));
    if (!store.get('since')) store.set('since', Date.now());
    store.set('plays', all);
    playsVersion++;
    if (view === 'top' || view === 'home') renderList();
  }
  if (heard?.track !== P.track) heard = P.track ? { track: P.track, ms: 0, since: 0, counted: false } : null;
  if (heard && P.playing) heard.since = now;
}

function resetSpotifyViews() {
  views.liked = likedView();
  views.all = allLikedView();
  views.top = topView();
}
resetSpotifyViews();

const cur = () => views[view];

async function showView(id) {
  view = id;
  const v = cur();
  renderTabs();
  renderLibrary();
  $('#list').scrollTop = 0;
  if (v.more && (v.pending ?? !v.tracks.length)) {
    loadingView = true;
    renderList();
    await v.more().catch(fail);
    loadingView = false;
    if (cur() !== v) return;
  }
  renderList();
}

function openCtx(v) {
  views.ctx = v;
  showView('ctx');
}

function renderTabs() {
  const tabs = [['home', 'Início'], ['queue', 'Fila'], ['all', 'Curtidas'], ['liked', 'Spotify'], ['yt', 'YouTube'], ['top', 'Mais ouvidas']];
  if (views.ctx) tabs.push(['ctx', views.ctx.title]);
  $('#tabs').innerHTML = tabs.map(([id, label]) =>
    `<button class="tab${id === view ? ' on' : ''}" data-view="${id}">${esc(t(label))}</button>`).join('');
}

// Faixas do Spotify trazem os artistas com id: cada nome abre o perfil.
const artistsHtml = track => (track.artists?.length
  ? track.artists.map(a => `<span class="link" data-artist-id="${esc(a.id)}">${esc(a.name)}</span>`).join(', ')
  : esc(track.artist));

function rowHtml(track, i) {
  const on = isCurrent(track, i);
  const likedNow = isLiked(track);
  return `<div class="row${on ? ' on' : ''}" data-i="${i}">
    <span class="num">${i + 1}</span>
    ${track.art ? `<img loading="lazy" src="${esc(track.art)}" alt="">` : '<span class="noart"></span>'}
    <span class="t">${esc(track.title)}</span>
    <span class="a">${artistsHtml(track)}</span>
    ${cur().showPlays ? playsHtml(track) : track.src === 'yt' ? '<span class="badge">YT</span>' : '<span></span>'}
    <span class="d">${track.dur ? fmt(track.dur) : ''}</span>
    <button class="ic${likedNow ? ' liked' : ''}" data-act="like" title="${t(likedNow ? 'Remover das curtidas' : 'Curtir')}">${icon('heart', likedNow ? 'solid' : '')}</button>
    <button class="ic" data-act="menu" title="${t('Mais opções')}">${icon('dots')}</button>
  </div>`;
}

function playsHtml(t) {
  const n = playCount(t);
  return n ? `<span class="plays" title="${tn(n, 'Tocou {n} vez no ALL MUSIC', 'Tocou {n} vezes no ALL MUSIC')}">${n}×</span>` : '<span></span>';
}

const isCurrent = (t, i) => !!P.track && (view === 'queue' ? i === P.index : keyOf(t) === keyOf(P.track));

function renderList() {
  const v = cur();
  const list = $('#list');
  list.hidden = !!v.home;
  $('#home-view').hidden = !v.home;
  if (v.home) return renderHome();
  // artista e álbum têm cabeçalho (e discografia no fim) em volta das faixas
  const head = v.head?.() || '';
  const foot = v.foot?.() || '';
  if (loadingView) {
    list.innerHTML = `<div class="empty">${t('Carregando…')}</div>`;
  } else if (!v.tracks.length && !v.more) {
    list.innerHTML = head + `<div class="empty">${esc(t(v.empty || 'Nada por aqui.'))}</div>` + foot;
  } else {
    list.classList.toggle('with-plays', !!v.showPlays);
    list.innerHTML = head + v.tracks.map(rowHtml).join('') + (!v.more ? '' : v.moreFailed ? MORE_RETRY : MORE_LOADING) + foot;
    loadMoreIfNear();
  }
}

// ---------- rolagem infinita ----------

const MORE_LOADING = `<div class="more">${t('Carregando mais…')}</div>`;
const MORE_RETRY = `<button class="btn more" data-retry>${t('Não deu para carregar. Tentar de novo')}</button>`;
let loadingMore = false;
let queueSource = null; // lista que originou a fila; páginas novas dela entram na fila também

async function loadMore() {
  const v = cur();
  if (loadingMore || loadingView || !v.more) return;
  loadingMore = true;
  const known = new Set(v.tracks);
  v.moreFailed = false;
  // Depois de uma falha, só tenta de novo quando a pessoa pedir.
  await v.more().catch(e => { v.moreFailed = true; fail(e); });
  loadingMore = false;
  if (queueSource === v) v.tracks.filter(t => !known.has(t)).forEach(t => enqueue(t));
  if (cur() !== v) return;
  renderList();
}

function loadMoreIfNear() {
  const list = $('#list');
  if (cur().moreFailed) return;
  if (list.scrollTop + list.clientHeight > list.scrollHeight - 600) loadMore();
}
$('#list').addEventListener('scroll', loadMoreIfNear, { passive: true });

function markCurrent() {
  const v = cur();
  for (const row of $('#list').querySelectorAll('.row')) {
    const i = +row.dataset.i;
    row.classList.toggle('on', isCurrent(v.tracks[i], i));
  }
}

async function toggleLike(t) {
  if (t.src === 'yt') {
    const list = ytList();
    const i = list.findIndex(x => x.id === t.id);
    if (i >= 0) list.splice(i, 1); else list.unshift({ ...t, at: Date.now() });
    store.set('yt', list);
  } else {
    const on = liked.has(t.uri);
    try {
      await S.like(t.uri, !on);
    } catch (e) {
      return fail(e);
    }
    if (on) liked.delete(t.uri); else liked.add(t.uri);
    // Mantém a lista de curtidas já carregada coerente, sem recarregar tudo.
    const tracks = views.liked.tracks;
    const i = tracks.findIndex(x => x.uri === t.uri);
    if (on && i >= 0) tracks.splice(i, 1);
    else if (!on && i < 0 && !views.all.pending) tracks.unshift({ ...t, at: Date.now() });
  }
  renderList();
}

// ---------- início: resumo do que você ouve no ALL MUSIC ----------

const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['all', 'Tudo']];

/** Reproduções por faixa no período ('7', '30' ou 'all'), da mais ouvida para a menos. */
function playCounts(period) {
  let entries;
  if (period === 'all') {
    entries = Object.values(plays()).map(p => ({ track: p.t, n: p.n }));
  } else {
    const since = Date.now() - +period * 86_400_000;
    const counts = new Map();
    for (const h of store.get('history', [])) if (h.at >= since) counts.set(h.k, (counts.get(h.k) || 0) + 1);
    entries = [...counts].map(([key, n]) => ({ track: plays()[key]?.t, n })).filter(e => e.track);
  }
  return entries.sort((a, b) => b.n - a.n);
}

/** Soma as reproduções por artista; a capa é a da faixa mais ouvida de cada um. */
function artistCounts(entries) {
  const artists = new Map();
  for (const { track, n } of entries) {
    for (const { name, id } of track.artists?.length ? track.artists : track.artist.split(', ').map(name => ({ name }))) {
      const a = artists.get(name) || { name, n: 0, best: 0, art: '' };
      a.id ||= id;
      a.n += n;
      if (n > a.best) { a.best = n; a.art = track.artBig || track.art; }
      artists.set(name, a);
    }
  }
  return [...artists.values()].sort((a, b) => b.n - a.n);
}

function ago(at) {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return t('agora');
  if (minutes < 60) return t('há {n} min', { n: minutes });
  if (minutes < 1440) return t('há {n} h', { n: Math.floor(minutes / 60) });
  return t('há {n} d', { n: Math.floor(minutes / 1440) });
}

const playsLabel = n => tn(n, '{n} reprodução', '{n} reproduções');

function renderHome() {
  const everything = playCounts('all');
  const period = store.get('homePeriod', 'all');
  const entries = period === 'all' ? everything : playCounts(period);
  const me = S.isConnected() ? store.get('me') : null;
  const name = me?.name || me?.user || 'ALL MUSIC';
  const total = everything.reduce((sum, e) => sum + e.n, 0);
  const listened = everything.reduce((sum, e) => sum + e.n * (e.track.dur || 0), 0) / 60_000;
  const youtube = everything.filter(e => e.track.src === 'yt').reduce((sum, e) => sum + e.n, 0);
  const share = total ? Math.round(youtube / total * 100) : 0;
  const top = everything[0];
  const since = store.get('since');
  const sinceText = since ? t('ouvindo desde {date}', { date: new Date(since).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) }) : '';
  const cover = (url, cls = '') => (url ? `<img class="${cls}" loading="lazy" src="${esc(url)}" alt="">` : `<span class="tile ${cls}"></span>`);
  const banner = top?.track.artBig || top?.track.art;

  const stat = (value, label) => `<div class="stat"><span class="eyebrow">${t(label)}</span><b>${value}</b></div>`;
  const head = `
    <header class="home-head"${banner ? ` style="--banner: url('${esc(banner)}')"` : ''}>
      <span class="home-avatar">${me?.image ? `<img src="${esc(me.image)}" alt="">` : esc(name[0].toUpperCase())}</span>
      <div class="home-id">
        <h1>${esc(name)}</h1>
        <small>${esc(sinceText)}</small>
        <div class="stats">
          ${stat(total, 'Reproduções')}
          ${stat(artistCounts(everything).length, 'Artistas')}
          ${stat(listened >= 60 ? t('{n} h', { n: Math.floor(listened / 60) }) : t('{n} min', { n: Math.round(listened) }), 'Tempo ouvido')}
          ${total ? `<div class="stat share"><span class="eyebrow">Spotify ${100 - share}% · YouTube ${share}%</span><span class="share-bar"><i style="width:${100 - share}%"></i></span></div>` : ''}
        </div>
      </div>
      ${top ? `<button class="home-top" data-play="${esc(keyOf(top.track))}">
        <span><span class="eyebrow">${t('Faixa mais ouvida')}</span><b>${esc(top.track.title)}</b><small>${esc(top.track.artist)}</small></span>
        ${cover(top.track.art)}</button>` : ''}
    </header>`;

  if (!total) {
    $('#home-view').innerHTML = head + `<div class="empty">${t('Ouça algumas músicas e esta tela se preenche com suas mais ouvidas, seus artistas e o tempo de escuta.')}</div>`;
    return;
  }

  const recent = store.get('recent', []).slice(0, 5);
  const artists = artistCounts(entries).slice(0, 8);
  const tracks = entries.slice(0, 5);
  const max = tracks[0]?.n || 1;
  const chips = PERIODS.map(([id, label]) => `<button class="chip${id === period ? ' on' : ''}" data-period="${id}">${t(label)}</button>`).join('');
  const nothing = `<div class="hint">${t('Nada neste período.')}</div>`;

  $('#home-view').innerHTML = head + `
    <section>
      <h2>${t('Tocadas recentemente')}</h2>
      ${recent.map((track, i) => `<button class="home-row" data-recent="${i}">${cover(track.art)}
        <b>${esc(track.title)}</b><span>${esc(track.artist)}</span><small>${track.playedAt ? ago(track.playedAt) : ''}</small></button>`).join('')}
    </section>
    <section>
      <div class="home-title"><h2>${t('Top artistas')}</h2><div class="chips">${chips}</div></div>
      ${artists.length ? `<div class="artists">${artists.map(a => `<button class="artist" data-artist="${esc(a.name)}" data-id="${esc(a.id || '')}"${a.art ? ` style="--art: url('${esc(a.art)}')"` : ''}>
        <b>${esc(a.name)}</b><small>${playsLabel(a.n)}</small></button>`).join('')}</div>` : nothing}
    </section>
    <section>
      <div class="home-title"><h2>${t('Top faixas')}</h2><button class="btn small ghost" data-go="top">${t('Ver todas')}</button></div>
      ${tracks.length ? tracks.map((e, i) => `<button class="home-row ranked" data-play="${esc(keyOf(e.track))}">
        <i>${i + 1}</i>${cover(e.track.art)}<b>${esc(e.track.title)}</b><span>${esc(e.track.artist)}</span>
        <span class="bar" style="--w:${Math.max(8, e.n / max * 100)}%">${playsLabel(e.n)}</span></button>`).join('') : nothing}
    </section>`;
}

$('#home-view').addEventListener('click', e => {
  const el = e.target.closest('[data-period], [data-play], [data-recent], [data-artist], [data-go]');
  if (!el) return;
  const { period, play, recent, artist, id, go } = el.dataset;
  if (period) { store.set('homePeriod', period); renderHome(); }
  else if (play) playNow(plays()[play].t);
  else if (recent) playNow(store.get('recent', [])[+recent]);
  else if (artist) { if (id && S.isConnected()) openArtist(id, artist); else searchFor(artist, S.isConnected() ? 'sp' : 'yt'); }
  else if (go) showView(go);
});

// ---------- biblioteca (esquerda) ----------

let libFilter = null;
let spPlaylists = [];

function renderLibrary() {
  const show = kind => !libFilter || libFilter === kind;
  const items = [];
  const item = (attrs, tile, rawName, rawSub, on, name = t(rawName), sub = t(rawSub)) =>
    `<button class="lib-item${on ? ' on' : ''}" ${attrs} title="${esc(name)} · ${esc(sub)}">${tile}<span class="lib-text"><b>${esc(name)}</b><small>${esc(sub)}</small></span></button>`;
  const cover = url => (url ? `<img loading="lazy" src="${esc(url)}" alt="">` : `<span class="tile"></span>`);

  if (!libFilter) {
    items.push(item('data-view="all"', `<span class="tile red">${icon('heart', 'solid')}</span>`, 'Músicas curtidas', 'Todas', view === 'all'));
    items.push(item('data-view="liked"', `<span class="tile">${icon('spotify')}</span>`, 'Músicas curtidas', 'Spotify', view === 'liked'));
    items.push(item('data-view="yt"', `<span class="tile light">${icon('yt')}</span>`, 'Músicas curtidas', 'YouTube', view === 'yt'));
  }
  if (show('local')) {
    for (const p of localPlaylists())
      items.push(item(`data-local="${esc(p.id)}"`, `<span class="tile">${icon('playlist')}</span>`, p.name,
        tn(p.tracks.length, 'Playlist · {n} música', 'Playlist · {n} músicas'), views.ctx?.localId === p.id && view === 'ctx'));
  }
  if (show('playlists')) {
    for (const p of spPlaylists)
      items.push(item(`data-playlist="${esc(p.id)}"`, cover(p.image), p.name, p.owner === 'spotify' ? 'Playlist · Spotify' : 'Playlist',
        views.ctx?.spId === p.id && view === 'ctx'));
  }
  if (libFilter && !items.length) {
    items.push(`<div class="hint">${t(libFilter === 'local' ? 'Crie uma playlist para misturar Spotify e YouTube.' : 'Nada por aqui.')}</div>`);
  }
  $('#lib-list').innerHTML = items.join('');
  for (const chip of $('#lib-chips').children) chip.classList.toggle('on', chip.dataset.lib === libFilter);
}

async function loadPlaylists() {
  try {
    spPlaylists = await S.playlists();
    // Playlist sem capa própria usa a capa da primeira faixa.
    for (const p of spPlaylists.filter(p => !p.image)) {
      S.playlist(p.id)
        .then(refs => (refs[0] ? S.tracks([refs[0].uri]) : []))
        .then(found => { if (found[0]?.art) { p.image = found[0].art; renderLibrary(); } })
        .catch(() => { });
    }
  } catch (e) {
    fail(e);
  }
  renderLibrary();
}

function openLocal(id) {
  const p = localPlaylists().find(x => x.id === id);
  if (!p) return;
  openCtx({ title: p.name, localId: id, get tracks() { return p.tracks; }, removable: true, empty: 'Playlist vazia. Use o menu ⋮ de qualquer música para adicionar aqui.' });
}

$('#lib-chips').addEventListener('click', e => {
  const kind = e.target.closest('.chip')?.dataset.lib;
  if (!kind) return;
  libFilter = libFilter === kind ? null : kind;
  renderLibrary();
});

$('#lib-list').addEventListener('click', e => {
  const el = e.target.closest('.lib-item');
  if (!el) return;
  const { view: v, local, playlist } = el.dataset;
  if (v) return showView(v);
  if (local) return openLocal(local);
  if (playlist) {
    const p = spPlaylists.find(x => x.id === playlist);
    return openCtx(lazy(p.name, () => S.playlist(playlist), { spId: playlist, empty: 'Playlist vazia.' }));
  }
});

$('#new-playlist').addEventListener('click', async () => {
  const name = await ask('Nova playlist', 'Nome da playlist');
  if (!name) return;
  const p = { id: crypto.randomUUID(), name, tracks: [] };
  localPlaylists().push(p);
  saveLocal();
  openLocal(p.id);
});

// ---------- lista central ----------

$('#tabs').addEventListener('click', e => {
  const id = e.target.closest('.tab')?.dataset.view;
  if (id) showView(id);
});

$('#list').addEventListener('click', async e => {
  const v = cur();
  if (e.target.closest('[data-retry]')) {
    v.moreFailed = false;
    return loadMore();
  }
  const link = e.target.closest('[data-artist-id], [data-album]');
  if (link) return link.dataset.album ? openAlbum(link.dataset.album) : openArtist(link.dataset.artistId, link.textContent);
  if (e.target.closest('[data-act="play-all"]')) {
    if (!v.tracks.length) return;
    queueSource = v;
    return playList(v.tracks, 0);
  }
  const row = e.target.closest('.row');
  if (!row) return;
  const i = +row.dataset.i;
  const t = v.tracks[i];
  const act = e.target.closest('[data-act]');
  if (act?.dataset.act === 'like') return toggleLike(t);
  if (act?.dataset.act === 'menu') return openMenu(act, t, i);
  if (view === 'queue') return jump(i);
  queueSource = v;
  playList(v.tracks, i);
});

// ---------- menu ⋮ ----------

let menuItems = [];

function openMenu(anchor, track, i) {
  const v = cur();
  const items = [
    ['Tocar a seguir', () => enqueue(track, true)],
    ['Adicionar à fila', () => enqueue(track)],
    null,
    ...localPlaylists().filter(p => p.id !== v.localId).map(p => [t('Adicionar a “{name}”', { name: p.name }), () => addToLocal(p, track)]),
    ['Adicionar a uma nova playlist…', async () => {
      const name = await ask('Nova playlist', 'Nome da playlist');
      if (!name) return;
      const p = { id: crypto.randomUUID(), name, tracks: [] };
      localPlaylists().push(p);
      addToLocal(p, track);
    }],
  ];
  const artist = track.artists?.[0];
  if (artist?.id && S.isConnected()) items.push(null, ['Ir para o artista', () => openArtist(artist.id, artist.name)]);
  if (track.album?.id && S.isConnected()) items.push(...(artist?.id ? [] : [null]), ['Ir para o álbum', () => openAlbum(track.album.id, track.album.name)]);
  if (v.removable) items.push(null, ['Remover desta lista', () => removeFromView(v, i)]);
  if (host) items.push(null, [track.src === 'yt' ? 'Abrir no YouTube' : 'Abrir no Spotify', () => host.postMessage({
    type: 'open', value: track.src === 'yt' ? 'https://www.youtube.com/watch?v=' + track.id : 'https://open.spotify.com/track/' + track.id,
  })]);
  showMenu(anchor, items);
}

/** Itens: [rótulo, ação, marcado?], null (separador) ou um texto (nota). */
function showMenu(anchor, items) {
  menuItems = items;
  const menu = $('#menu');
  menu.innerHTML = items.map((it, k) => (!it ? '<hr>' : typeof it === 'string' ? `<small>${esc(t(it))}</small>`
    : `<button data-k="${k}"${it[2] ? ' class="on"' : ''}>${esc(t(it[0]))}${it[2] ? icon('check') : ''}</button>`)).join('');
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)) + 'px';
}

function addToLocal(p, track) {
  if (p.tracks.some(x => keyOf(x) === keyOf(track))) return toast('Já está nessa playlist');
  p.tracks.push(track);
  saveLocal();
  renderLibrary();
  toast(t('Adicionada a “{name}”', { name: p.name }));
}

function removeFromView(v, i) {
  if (v === views.queue) {
    if (i === P.index) return toast('Essa é a música que está tocando');
    removeFromQueue(i);
  } else if (v === views.yt) {
    ytList().splice(i, 1);
    store.set('yt', ytList());
  } else if (v.localId) {
    v.tracks.splice(i, 1);
    saveLocal();
  }
  renderList();
  renderLibrary();
}

$('#menu').addEventListener('click', e => {
  const k = e.target.closest('button')?.dataset.k;
  $('#menu').hidden = true;
  if (k != null) menuItems[+k][1]();
});
document.addEventListener('pointerdown', e => {
  if (!$('#menu').hidden && !e.target.closest('#menu')) $('#menu').hidden = true;
}, true);

// ---------- artista e álbum (Spotify) ----------

const heroHtml = (kind, info, sub, circle) => `
  <header class="hero"${info.image ? ` style="--banner: url('${esc(info.image)}')"` : ''}>
    ${info.image ? `<img class="${circle ? 'circle' : ''}" src="${esc(info.image)}" alt="">` : `<span class="tile${circle ? ' circle' : ''}"></span>`}
    <div>
      <span class="eyebrow">${t(kind)}</span>
      <h1>${esc(info.name)}</h1>
      ${sub ? `<small>${esc(sub)}</small>` : ''}
      <button class="btn primary" data-act="play-all">${icon('play', 'solid')}${t('Tocar')}</button>
    </div>
  </header>`;

const NO_SPOTIFY_PAGES = 'Conecte o Spotify pelo ícone de conta para ver artistas e álbuns.';

function openArtist(id, name) {
  if (!S.isConnected()) return toast(NO_SPOTIFY_PAGES);
  let info = null;
  const v = lazy(name || t('Artista'), async () => {
    info = await S.artist(id);
    v.title = info.name;
    renderTabs();
    return info.top;
  }, {
    empty: 'Nenhuma faixa popular disponível.',
    head: () => (info ? heroHtml('Artista', info, '', true) + `<h2 class="sec">${t('Populares')}</h2>` : ''),
    foot: () => (info?.albums.length ? `<h2 class="sec">${t('Discografia')}</h2><div class="albums">${info.albums.map(a => `<button class="album" data-album="${esc(a.id)}">
      ${a.image ? `<img loading="lazy" src="${esc(a.image)}" alt="">` : '<span class="tile"></span>'}<b>${esc(a.name)}</b><small>${a.year || ''}</small></button>`).join('')}</div>` : ''),
  });
  openCtx(v);
}

function openAlbum(id, name) {
  if (!S.isConnected()) return toast(NO_SPOTIFY_PAGES);
  let info = null;
  const v = lazy(name || t('Álbum'), async () => {
    info = await S.album(id);
    v.title = info.name;
    renderTabs();
    return info.refs;
  }, {
    empty: 'Álbum vazio.',
    head: () => (info ? heroHtml('Álbum', info, [info.artist, info.year].filter(Boolean).join(' · '), false) : ''),
  });
  openCtx(v);
}

// ---------- busca / YouTube ----------

let searchTimer = 0;

async function addYouTube(id) {
  let t = ytList().find(x => x.id === id);
  if (!t) {
    try {
      t = await fetchYouTubeTrack(id);
    } catch (e) {
      return fail(e);
    }
    t.at = Date.now();
    ytList().unshift(t);
    store.set('yt', ytList());
  }
  $('#search').value = '';
  await showView('yt');
  playNow(t);
}

// Onde a busca procura: 'sp' ou 'yt'. Sem Spotify conectado, começa no YouTube.
const searchSource = () => store.get('searchSource') || (S.isConnected() ? 'sp' : 'yt');
const NO_SPOTIFY_SEARCH = 'Conecte o Spotify pelo ícone de conta para buscar nele.';

/** Abre a lista completa de resultados de `q` na fonte escolhida. */
function searchFor(q, source = searchSource()) {
  if (source === 'yt') {
    const v = { title: t('YouTube: {q}', { q }), tracks: [], empty: 'Nenhum resultado.' };
    v.more = async () => {
      v.tracks = await searchYouTube(q);
      v.more = null;
    };
    return openCtx(v);
  }
  if (!S.isConnected()) return toast(NO_SPOTIFY_SEARCH);
  openCtx(lazy(t('Busca: {q}', { q }), () => S.search(q), { empty: 'Nenhum resultado.' }));
}

function runSearch(text) {
  const q = text.trim();
  if (!q) return;
  const id = parseYouTubeId(q);
  if (id) return addYouTube(id);
  if (/^https?:\/\//i.test(q)) return toast('Link não reconhecido. Cole um link de vídeo do YouTube.');
  searchFor(q);
}

const drop = $('#search-drop');
let dropTracks = [];
let dropIndex = -1;   // item destacado pelo teclado; dropTracks.length é o "ver todos"
let dropSeq = 0;      // descarta respostas de buscas antigas

function closeDrop() {
  dropSeq++;
  drop.hidden = true;
  dropTracks = [];
  dropIndex = -1;
}

function drawDrop(message) {
  drop.hidden = false;
  const source = searchSource();
  const tabs = `<div class="drop-tabs">${[['sp', 'Spotify', 'spotify'], ['yt', 'YouTube', 'yt']].map(([id, label, glyph]) =>
    `<button class="chip${id === source ? ' on' : ''}" data-source="${id}">${icon(glyph)}${label}</button>`).join('')}</div>`;
  if (message) return void (drop.innerHTML = tabs + `<div class="hint">${esc(t(message))}</div>`);
  drop.innerHTML = tabs + dropTracks.map((track, i) => {
    const likedNow = isLiked(track);
    return `<div class="drop-item${i === dropIndex ? ' on' : ''}" data-i="${i}">
      ${track.art ? `<img src="${esc(track.art)}" alt="">` : '<span class="tile"></span>'}
      <span class="lib-text"><b>${esc(track.title)}</b><small>${esc(track.artist)}</small></span>
      <button class="ic${likedNow ? ' liked' : ''}" data-like title="${t(likedNow ? 'Remover das curtidas' : 'Curtir')}">${icon('heart', likedNow ? 'solid' : '')}</button></div>`;
  }).join('')
    + `<button class="drop-all${dropIndex === dropTracks.length ? ' on' : ''}" data-all>${t('Ver todos os resultados')}</button>`;
}

async function suggest(text) {
  const q = text.trim();
  if (q.length < 2) return closeDrop();
  const seq = ++dropSeq;
  const source = searchSource();
  if (source === 'sp' && !S.isConnected()) {
    dropTracks = [];
    return drawDrop(NO_SPOTIFY_SEARCH);
  }
  if (drop.hidden || !dropTracks.length) drawDrop('Buscando…');
  try {
    let found;
    if (source === 'yt') {
      found = (await searchYouTube(q)).slice(0, 6);
    } else {
      const refs = await S.search(q);
      found = refs.length ? await S.tracks(refs.slice(0, 6).map(r => r.uri)) : [];
    }
    if (seq !== dropSeq) return;
    dropTracks = found;
    dropIndex = -1;
    drawDrop(found.length ? '' : 'Nenhum resultado.');
  } catch (e) {
    if (seq !== dropSeq) return;
    dropTracks = [];
    drawDrop(e.message);
  }
}

function pickFromDrop(i) {
  const track = dropTracks[i];
  const text = $('#search').value;
  closeDrop();
  if (track) {
    $('#search').value = '';
    playNow(track);
  } else {
    runSearch(text);
  }
}

$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const text = e.target.value;
  if (parseYouTubeId(text)) {
    closeDrop();
    return runSearch(text);
  }
  // a busca do YouTube é mais pesada (uma página inteira por consulta): espera um pouco mais
  searchTimer = setTimeout(() => suggest(text), searchSource() === 'yt' ? 450 : 280);
});
$('#search').addEventListener('focus', e => {
  if (drop.hidden && e.target.value.trim().length >= 2) suggest(e.target.value);
});
$('#search').addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeDrop();
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && dropTracks.length) {
    e.preventDefault();
    const count = dropTracks.length + 1;
    dropIndex = (dropIndex + (e.key === 'ArrowDown' ? 1 : -1) + count + (dropIndex < 0 && e.key === 'ArrowUp' ? 1 : 0)) % count;
    return drawDrop();
  }
  if (e.key !== 'Enter') return;
  clearTimeout(searchTimer);
  if (dropIndex >= 0) return pickFromDrop(dropIndex);
  closeDrop();
  runSearch(e.target.value);
});
// mousedown não tira o foco do campo; o clique escolhe
drop.addEventListener('mousedown', e => e.preventDefault());
drop.addEventListener('click', async e => {
  const tab = e.target.closest('[data-source]');
  if (tab) {
    clearTimeout(searchTimer);
    store.set('searchSource', tab.dataset.source);
    dropTracks = [];
    dropIndex = -1;
    return suggest($('#search').value);
  }
  const item = e.target.closest('.drop-item');
  if (item && e.target.closest('[data-like]')) {
    await toggleLike(dropTracks[+item.dataset.i]);
    if (!drop.hidden && dropTracks.length) drawDrop();
    return;
  }
  if (item) pickFromDrop(+item.dataset.i);
  else if (e.target.closest('[data-all]')) pickFromDrop(-1);
});
document.addEventListener('pointerdown', e => {
  if (!drop.hidden && !e.target.closest('.search-wrap')) closeDrop();
}, true);

$('#home').addEventListener('click', () => showView('home'));

// ---------- barra de título ----------

document.body.classList.toggle('hosted', !!host);
document.querySelector('.win').addEventListener('click', e => {
  const action = e.target.closest('[data-win]')?.dataset.win;
  if (action) host?.postMessage({ type: 'win', value: action });
});

// ---------- tocando agora ----------

const seekEl = $('#seek');
const volEl = $('#volume');
let seeking = false;
let ticker = 0;

const paint = el => el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');

function drawProgress() {
  const pos = position();
  const dur = P.dur;
  if (!seeking) {
    seekEl.value = dur ? Math.min(1000, pos / dur * 1000) : 0;
    paint(seekEl);
  }
  $('#pb-cur').textContent = fmt(pos);
  $('#pb-rem').textContent = dur ? '-' + fmt(dur - pos) : '';
}

// O relógio de progresso só roda tocando e com a janela visível.
function syncTicker() {
  const run = P.playing && !document.hidden;
  if (run && !ticker) ticker = setInterval(drawProgress, 500);
  else if (!run && ticker) { clearInterval(ticker); ticker = 0; }
  if (!document.hidden) drawProgress();
}
document.addEventListener('visibilitychange', syncTicker);

function renderRecent() {
  const rec = store.get('recent', []);
  $('#recent').innerHTML = rec.length
    ? rec.map((t, i) => `<button class="rec" data-i="${i}">${t.art ? `<img loading="lazy" src="${esc(t.art)}" alt="">` : '<span class="tile"></span>'}
        <span class="lib-text"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>`).join('')
    : `<div class="hint">${t('O que você ouvir aparece aqui.')}</div>`;
}
$('#recent').addEventListener('click', e => {
  const i = e.target.closest('.rec')?.dataset.i;
  if (i != null) playNow(store.get('recent', [])[+i]);
});

function onTrack() {
  const t = P.track;
  $('#pb-title').textContent = t.title;
  $('#pb-artist').textContent = t.artist;
  $('#pb-artist').classList.toggle('link', !!t.artists?.length);
  if (t.art) $('#pb-art').src = t.art; else $('#pb-art').removeAttribute('src');
  host?.postMessage({ type: 'now', value: `${t.title} · ${t.artist}` });

  const rec = store.get('recent', []).filter(x => keyOf(x) !== keyOf(t));
  rec.unshift({ ...t, playedAt: Date.now() });
  store.set('recent', rec.slice(0, 20));
  renderRecent();
  markCurrent();
}

function onState() {
  const name = P.playing ? 'pause' : 'play';
  $('#play-icon').setAttribute('href', '/icons.svg#' + name);
  $('#shuffle').classList.toggle('on', P.shuffle);
  $('#repeat').classList.toggle('on', P.repeat);
  // A duração de um vídeo só é conhecida depois que ele carrega; guarda para as listas.
  const t = P.track;
  if (t?.src === 'yt' && !t.dur && P.dur) {
    t.dur = Math.round(P.dur);
    const saved = ytList().find(x => x.id === t.id);
    if (saved) { saved.dur = t.dur; store.set('yt', ytList()); }
    saveLocal();
    renderList();
  }
  syncTicker();
}

onChange((type, data) => {
  if (type === 'track') { trackHeard(); onTrack(); onState(); }
  else if (type === 'state') { trackHeard(); onState(); }
  else if (type === 'queue') { if (view === 'queue') renderList(); }
  else if (type === 'toast') toast(data);
});

$('#play').addEventListener('click', toggle);
$('#next').addEventListener('click', () => next());
$('#prev').addEventListener('click', prev);
$('#shuffle').addEventListener('click', () => setMode('shuffle', !P.shuffle));
$('#repeat').addEventListener('click', () => setMode('repeat', !P.repeat));

seekEl.addEventListener('input', () => { seeking = true; paint(seekEl); });
seekEl.addEventListener('change', () => {
  seeking = false;
  if (P.dur) seek(seekEl.value / 1000 * P.dur);
});

$('#pb-artist').addEventListener('click', () => {
  const artist = P.track?.artists?.[0];
  if (artist) openArtist(artist.id, artist.name);
});

// Efeitos de áudio: nas faixas do Spotify quem processa o som é o motor; nas do YouTube, um script
// dentro do iframe do player (yt-fx.js). Os dois recebem os mesmos valores.
// Cada ajuste é um controle de 0 a 100; `applyFx` converte para as grandezas que o motor usa.
// Cada efeito tem variações: pontos de partida para os ajustes (controles de 0 a 100) que a pessoa
// pode mexer depois. `applyFx` converte os controles nas grandezas que o som usa.
const FX = [
  { id: '', name: 'Sem efeito', hint: 'Som original' },
  {
    id: 'muffled', name: 'Abafado', hint: 'Como no cômodo ao lado',
    knobs: [['damp', 'Abafamento'], ['bass', 'Graves'], ['boost', 'Volume']],
    variants: [
      { id: 'room', name: 'Cômodo ao lado', damp: 58, bass: 75, boost: 30, steep: true },
      { id: 'soft', name: 'Suave', damp: 24, bass: 100, boost: 10 },
      { id: 'voice', name: 'Voz em destaque', damp: 12, bass: 20, boost: 35, steep: true },
      { id: 'water', name: 'Debaixo d’água', damp: 74, bass: 100, boost: 40, steep: true, q: 2.5 },
    ],
  },
  {
    id: '8d', name: 'Áudio 8D', hint: 'Gira ao seu redor · use fones',
    knobs: [['speed', 'Velocidade'], ['width', 'Abertura'], ['echo', 'Eco']],
    variants: [
      { id: 'classic', name: 'Clássico', speed: 65, width: 100, echo: 50 },
      { id: 'slow', name: 'Órbita lenta', speed: 25, width: 100, echo: 60 },
      { id: 'fast', name: 'Rápido', speed: 92, width: 90, echo: 30 },
      { id: 'hop', name: 'Pingue-pongue', speed: 80, width: 100, echo: 35, hop: true },
      { id: 'hall', name: 'Sala ampla', speed: 50, width: 70, echo: 95 },
    ],
  },
];
const fxPanel = $('#fx-panel');
let fxOpen = ''; // efeito com os ajustes abertos (o painel mostra só ele)

const fxVariant = fx => fx.variants.find(v => v.id === store.get('fxVariant', {})[fx.id]) || fx.variants[0];
/** Ajustes em vigor de um efeito: os da variação escolhida, com o que a pessoa mudou por cima. */
const fxKnobs = fx => ({ ...fxVariant(fx), ...store.get('fxTweaks', {})[fx.id] });
const setTweaks = (id, tweaks) => store.set('fxTweaks', { ...store.get('fxTweaks', {}), [id]: tweaks });

function applyFx() {
  const muffled = fxKnobs(FX[1]);
  const spin = fxKnobs(FX[2]);
  const params = {
    cutoff: 4000 * (150 / 4000) ** (muffled.damp / 100), // 4000 Hz (leve) … 150 Hz (bem abafado)
    q: muffled.q || Math.SQRT1_2,
    steep: !!muffled.steep,
    hp: 400 * (1 - muffled.bass / 100),                  // menos graves = corte mais alto
    gain: 1 + muffled.boost / 50,                        // 1× … 3×
    turn: 20 - spin.speed * 0.17,                        // uma volta a cada 20 s … 3 s
    depth: spin.width / 100,
    echo: spin.echo / 100,
    hop: !!spin.hop,
  };
  S.setFx(store.get('fx', ''), params);
  setYouTubeFx(store.get('fx', ''), params);
  $('#fx').classList.toggle('on', !!store.get('fx', ''));
}

function renderFx() {
  const active = store.get('fx', '');
  const editing = FX.find(fx => fx.id === fxOpen && fx.knobs);
  if (editing) {
    const k = fxKnobs(editing);
    fxPanel.innerHTML = `
      <header class="fx-head"><button class="ic" data-back title="${t('Voltar')}">${icon('expand')}</button>${t(editing.name)}</header>
      <div class="fx-variants">${editing.variants.map(v => `<button class="chip${v.id === k.id ? ' on' : ''}" data-variant="${v.id}">${t(v.name)}</button>`).join('')}</div>
      <div class="fx-knobs">
        ${editing.knobs.map(([key, label]) => `<label><span>${t(label)}</span><input type="range" min="0" max="100" value="${k[key]}" data-knob="${key}"><output>${k[key]}</output></label>`).join('')}
        <button class="btn small ghost" data-reset>${t('Restaurar padrão')}</button>
      </div>`;
  } else {
    fxPanel.innerHTML = `<span class="eyebrow">${t('Efeitos de áudio')}</span>` + FX.map(fx => `
      <div class="fx-row${fx.id === active ? ' on' : ''}">
        <button class="fx-pick" data-fx="${fx.id}"><span class="fx-dot"></span><span class="lib-text"><b>${t(fx.name)}</b><small>${t(fx.variants ? fxVariant(fx).name : fx.hint)}</small></span></button>
        ${fx.knobs ? `<button class="ic" data-gear="${fx.id}" title="${t('Ajustar efeito')}">${icon('tune')}</button>` : ''}
      </div>`).join('');
  }
  for (const el of fxPanel.querySelectorAll('input')) paint(el);
}

function pickFx(id) {
  store.set('fx', id);
  applyFx();
}

$('#fx').addEventListener('click', () => {
  if (!fxPanel.hidden) return void (fxPanel.hidden = true);
  fxOpen = '';
  renderFx();
  fxPanel.hidden = false;
  const bar = document.querySelector('.playerbar').getBoundingClientRect();
  fxPanel.style.right = innerWidth - bar.right + 'px';
  fxPanel.style.bottom = innerHeight - bar.top + 8 + 'px';
});
fxPanel.addEventListener('click', e => {
  const { fx, gear, variant, reset, back } = e.target.closest('[data-fx], [data-gear], [data-variant], [data-reset], [data-back]')?.dataset || {};
  if (fx != null) {
    pickFx(fx);
  } else if (gear) {
    // abrir os ajustes já liga o efeito, para ouvir o que está mudando
    fxOpen = gear;
    if (store.get('fx', '') !== gear) pickFx(gear);
  } else if (back != null) {
    fxOpen = '';
  } else if (variant) {
    // trocar de variação recomeça dos ajustes dela
    store.set('fxVariant', { ...store.get('fxVariant', {}), [fxOpen]: variant });
    setTweaks(fxOpen, {});
    applyFx();
  } else if (reset != null) {
    setTweaks(fxOpen, {});
    applyFx();
  } else {
    return;
  }
  renderFx();
});
fxPanel.addEventListener('input', e => {
  const key = e.target.dataset.knob;
  if (!key) return;
  setTweaks(fxOpen, { ...store.get('fxTweaks', {})[fxOpen], [key]: +e.target.value });
  paint(e.target);
  e.target.nextElementSibling.textContent = e.target.value;
  applyFx();
});
document.addEventListener('pointerdown', e => {
  if (!fxPanel.hidden && !e.target.closest('#fx-panel, #fx')) fxPanel.hidden = true;
}, true);
applyFx();

volEl.value = Math.round(P.volume * 100);
paint(volEl);
volEl.addEventListener('input', () => { paint(volEl); setVolume(volEl.value / 100); });

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target.closest('input, dialog')) return;
  e.preventDefault();
  toggle();
});

// ---------- painéis laterais ----------

function setLibrary(open) {
  store.set('library', open);
  document.body.classList.toggle('lib-collapsed', !open);
  $('#lib-toggle').title = t(open ? 'Recolher biblioteca' : 'Expandir biblioteca');
}
$('#lib-toggle').addEventListener('click', () => setLibrary(!store.get('library', true)));
$('#lib-close').addEventListener('click', () => setLibrary(false));

function setSide(open) {
  store.set('side', open);
  document.body.classList.toggle('side-collapsed', !open);
}
$('#side-open').addEventListener('click', () => setSide(true));
$('#side-close').addEventListener('click', () => setSide(false));

// ---------- diálogos ----------

for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close('cancel');
  });
}

let askDone = null;

function ask(title, placeholder) {
  const dlg = $('#ask');
  const input = $('#ask-input');
  $('#ask-title').textContent = t(title);
  input.placeholder = t(placeholder);
  input.value = '';
  dlg.showModal();
  return new Promise(resolve => { askDone = resolve; });
}

function finishAsk(value) {
  const done = askDone;
  askDone = null;
  if ($('#ask').open) $('#ask').close();
  done?.(value);
}
$('#ask form').addEventListener('submit', e => {
  e.preventDefault();
  finishAsk($('#ask-input').value.trim() || null);
});
$('#ask').addEventListener('close', () => finishAsk(null));

function openSettings() {
  const me = store.get('me');
  const account = S.isConnected()
    ? `<span class="lib-text"><b>${esc(me?.name || me?.user || t('Conta conectada'))}</b><small>Spotify</small></span>
       <button class="btn small" id="sp-logout">${icon('logout')}${t('Sair')}</button>`
    : `<span class="lib-text"><b>${t('Sem Spotify')}</b><small>${t('Só músicas do YouTube')}</small></span>
       <button class="btn small primary" id="sp-login">${icon('spotify')}${t('Conectar')}</button>`;
  $('#settings-body').innerHTML = `
    <h4>${t('Conta')}</h4>
    <div class="account-row">${account}</div>
    <h4>${t('Idioma')}</h4>
    <select id="lang-select" class="select">${Object.entries(LANGUAGES).map(([code, name]) => `<option value="${code}"${code === lang ? ' selected' : ''}>${name}</option>`).join('')}</select>
    <h4>${t('Desempenho')}</h4>
    <p>${t('Minimizar a janela manda o ALL MUSIC para a bandeja e libera memória; a música continua.')}</p>`;
  $('#settings').showModal();
}

$('#settings-body').addEventListener('click', e => {
  if (e.target.closest('#sp-logout')) {
    S.logout();
    leaveApp();
    showOnboard('');
  }
  else if (e.target.closest('#sp-login')) {
    $('#settings').close();
    S.login();
  }
});
$('#settings-body').addEventListener('change', e => {
  if (e.target.id === 'lang-select') setLanguage(e.target.value);
});
$('#account').addEventListener('click', openSettings);

function renderAccount() {
  const me = S.isConnected() ? store.get('me') : null;
  const btn = $('#account');
  btn.classList.toggle('connected', !!me);
  btn.innerHTML = me?.image ? `<img src="${esc(me.image)}" alt="">` : me ? esc((me.name || me.user || '?')[0].toUpperCase()) : icon('user');
}

// ---------- conta: onboarding, entrada e saída ----------

let inApp = false;
let guest = false; // dentro do app sem Spotify (só YouTube)

function setObStatus(text, error = false) {
  const el = $('#ob-status');
  el.hidden = !text;
  el.textContent = t(text || '');
  el.classList.toggle('error', error);
}

function showOnboard(message, error = false, canConnect = true) {
  document.body.classList.add('gated');
  $('#ob-connect').disabled = !canConnect;
  setObStatus(message, error);
}

$('#ob-connect').addEventListener('click', () => {
  // com o motor parado, o botão primeiro o religa; o login vem em seguida
  if (S.isGone()) {
    showOnboard('Iniciando…', false, false);
    S.restart();
  } else {
    $('#ob-connect').disabled = true;
    setTimeout(() => { $('#ob-connect').disabled = false; }, 2500);
    S.login();
  }
});
$('#ob-skip').addEventListener('click', () => {
  store.set('guest', true);
  enterApp(null);
});

function enterApp(user) {
  inApp = true;
  guest = !user;
  document.body.classList.remove('gated');
  resetSpotifyViews();
  views.ctx = null;
  if (guest) {
    renderAccount();
    return showView('home');
  }
  // O perfil guardado é de outra conta? Descarta.
  if (store.get('me')?.user !== user) store.set('me', { user });
  renderAccount();
  S.profile().then(me => { store.set('me', me); renderAccount(); }).catch(() => { });
  loadPlaylists();
  // Com as curtidas em mãos os corações das listas já abertas passam a valer.
  likedRefs().then(() => renderList()).catch(fail);
  showView('home');
}

// Saída manual, sessão revogada ou motor parado: limpa o que era da conta e volta para o onboarding.
function leaveApp() {
  if (!inApp) return;
  inApp = false;
  if (P.playing) toggle();
  store.del('me');
  spPlaylists = [];
  liked.clear();
  likedRefsPromise = null;
  resetSpotifyViews();
  views.ctx = null;
  for (const dlg of document.querySelectorAll('dialog[open]')) dlg.close();
  renderAccount();
}

host?.addEventListener('message', e => {
  const { type, value } = e.data || {};
  if (type === 'window') {
    const max = value === 'max';
    $('#win-max-icon').setAttribute('href', '/icons.svg#' + (max ? 'copy' : 'win-max'));
    $('[data-win="max"]').title = t(max ? 'Restaurar' : 'Maximizar');
  }
  else if (type === 'media') {
    if (value === 'toggle') toggle();
    else if (value === 'next') next();
    else if (value === 'prev') prev();
    else if (value === 'pause' && P.playing) toggle();
  }
});

// ---------- início ----------

// Vídeos salvos antes de existir a data de curtida entram como curtidos agora.
if (ytList().some(t => !t.at)) {
  ytList().forEach(t => { t.at ||= Date.now(); });
  store.set('yt', ytList());
}
setSide(store.get('side', true));
setLibrary(store.get('library', true));
renderAccount();
renderRecent();

translateDom();
document.documentElement.classList.remove('booting');
host?.postMessage({ type: 'lang', value: lang });
showOnboard('Iniciando…', false, false);
S.start({
  status(state, user) {
    if (state === 'ready') {
      applyFx(); // o motor acabou de subir (ou reiniciou) sem efeito
      store.del('guest');
      if (!inApp || guest) enterApp(user);
      return;
    }
    if (state === 'login_started') {
      const message = 'Confirme no navegador que abriu. Esta tela continua sozinha quando você voltar.';
      return inApp ? toast('Confirme o login do Spotify no navegador que abriu') : showOnboard(message, false, true);
    }
    // need_login, gone ou unavailable
    if (inApp && guest) return;
    leaveApp();
    if (store.get('guest')) return enterApp(null);
    if (state === 'need_login') showOnboard('');
    else if (state === 'gone') showOnboard(t('O motor do Spotify não iniciou. Clique em conectar para tentar de novo.') + (user ? ` (${user})` : ''), true, true);
    else showOnboard('Abra pelo aplicativo ALL MUSIC para conectar ao Spotify.', true, false);
  },
  notice(message) {
    if (inApp) toast(message);
    else showOnboard(message, true);
  },
});
