// Vídeo das novidades (versão 4): busca no YouTube, curtir pela busca, efeitos de áudio com
// variações e ajustes, e perfil de artista. A tela e o som vêm do próprio app, gravados por
// tools/video/record-fx.mjs (video/public/tour2, tour2b e fx-audio.wav); as animações dos efeitos
// acompanham o som de verdade, medido quadro a quadro por tools/video/fx-audio.mjs.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { HeadphonesIcon } from '@hugeicons/core-free-icons';
import tour from '../public/tour2/meta.json';
import tourB from '../public/tour2b/meta.json';
import sound from '../public/tour2/audio.json';
import { C, DISPLAY, UI } from './Promo.jsx';
import { CLAMP, Caption, EASE, EYEBROW, Red, useIn } from './Demo2.jsx';

const FPS = 30;
const M = tour.marks;
const MB = tourB.marks;
const CLICK = 0.9; // do início do movimento do cursor (a marcação) até o clique

const Icon = ({ icon, size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color, flex: 'none' }}>
    {icon.map(([Tag, { key, ...attrs }], i) => <Tag key={i} {...attrs} />)}
  </svg>
);

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => Math.min(1, Math.max(0, v));

/** Quadro do passeio no instante t (segundos): o último capturado até ali. */
function frameAt(meta, t) {
  const frames = meta.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo].file;
}

/** Som no instante t do passeio principal: nível (0 a 1) e lado (-1 esquerda … 1 direita). */
function soundAt(t) {
  const i = Math.round((t - tour.audioStart) * FPS);
  let pan = 0;
  let level = 0;
  for (let k = -3; k <= 3; k++) {
    pan += sound.pan[i + k] || 0;
    level += sound.level[i + k] || 0;
  }
  return { pan: pan / 7, level: clamp01(level / 7 * 7) };
}

// ---------- efeitos ao longo do passeio ----------

// depth: o quanto a imagem "abafa"; spin: o quanto ela acompanha o som de um lado para o outro
const STATES = [
  { at: M['fx-open'], title: 'Audio effects', preset: 'New', line: 'Pick one while the music plays.' },
  { at: M.muffled, kind: 'muffled', title: 'Muffled', preset: 'Next room', line: 'Like the party is behind a wall.', depth: 0.65 },
  { at: M['muffled-soft'], kind: 'muffled', title: 'Muffled', preset: 'Soft', line: 'Just takes the edge off.', depth: 0.3 },
  { at: M['muffled-voice'], kind: 'muffled', title: 'Muffled', preset: 'Vocals forward', line: 'Less beat, more voice.', depth: 0.45 },
  { at: M['muffled-water'], kind: 'muffled', title: 'Muffled', preset: 'Underwater', line: 'Deep, like the bottom of a pool.', depth: 1, water: 1 },
  { at: M['muffled-drag'], kind: 'muffled', title: 'Muffled', preset: 'Your own mix', line: 'Drag a slider and hear it change live.', depth: 0.6, water: 0.6 },
  { at: M['8d'], kind: '8d', title: '8D audio', preset: 'Classic', line: 'The sound circles around your head.', spin: 1 },
  { at: M['8d-hop'], kind: '8d', title: '8D audio', preset: 'Ping-pong', line: 'Jumps from ear to ear.', spin: 1 },
  { at: M['8d-fast'], kind: '8d', title: '8D audio', preset: 'Fast', line: 'A quicker spin.', spin: 1 },
  { at: M['8d-hall'], kind: '8d', title: '8D audio', preset: 'Big room', line: 'Wider, with more echo.', spin: 1 },
  { at: M.off, title: 'No effect', preset: 'Original', line: 'Back to the original sound.' },
].map(s => ({ depth: 0, water: 0, spin: 0, ...s, at: s.at + CLICK }));

/** Estado em vigor em t, o anterior e o quanto a troca já avançou (0 a 1, em 0,45 s). */
function stateAt(t) {
  let i = -1;
  while (i + 1 < STATES.length && STATES[i + 1].at <= t) i++;
  const none = { depth: 0, water: 0, spin: 0 };
  const now = i >= 0 ? STATES[i] : none;
  return { now, before: i > 0 ? STATES[i - 1] : none, index: i, k: i >= 0 ? clamp01((t - now.at) / 0.45) : 1 };
}

// ---------- a tela gravada ----------

/**
 * Trecho de um passeio, de `from` a `to` segundos, tocado na velocidade `rate`.
 * `cam`: quadros-chave { f, z, x, y } de zoom e foco, em pixels do quadro (1920x1080).
 * `effects`: a imagem reage ao efeito de áudio em vigor.
 */
const Shot = ({ meta, dir, from, to, rate = 1, cam, effects = false, children }) => {
  const frame = useCurrentFrame();
  const t = Math.min(to, from + (frame / FPS) * rate);
  const keys = cam || [{ f: 0, z: 1, x: 960, y: 540 }];
  const at = key => (keys.length === 1 ? keys[0][key] : interpolate(frame, keys.map(k => k.f), keys.map(k => k[key]), EASE));
  const z = at('z');
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - at('x') * z));
  const ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - at('y') * z));

  let depth = 0, water = 0, spin = 0, pan = 0;
  if (effects) {
    const { now, before, k } = stateAt(t);
    depth = lerp(before.depth, now.depth, k);
    water = lerp(before.water, now.water, k);
    spin = lerp(before.spin, now.spin, k);
    pan = soundAt(t).pan;
  }
  const sway = pan * spin;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.black }}>
      <AbsoluteFill style={{
        transform: `perspective(1600px) scale(${1 + spin * 0.05}) translateX(${sway * 26}px) rotateY(${sway * 3.6}deg)`,
        filter: depth ? `saturate(${1 - depth * 0.55}) brightness(${1 - depth * 0.14}) blur(${depth * 1.1}px)` : undefined,
      }}>
        <Img src={staticFile(`${dir}/${frameAt(meta, t)}`)} style={{ position: 'absolute', width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }} />
      </AbsoluteFill>
      {/* abafado: as bordas escurecem; "debaixo d'água" ganha um tom azul */}
      <AbsoluteFill style={{ opacity: depth, background: 'radial-gradient(ellipse at center, rgba(8,8,8,0) 45%, rgba(8,8,8,.7) 100%)' }} />
      <AbsoluteFill style={{ opacity: water * 0.3, background: 'linear-gradient(#1D6FD0, #0A2A66)', mixBlendMode: 'screen' }} />
      {/* 8D: o lado em que o som está acende */}
      <AbsoluteFill style={{ opacity: clamp01(-sway) * 0.75, background: `linear-gradient(90deg, ${C.red}, rgba(242,44,61,0) 30%)`, mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ opacity: clamp01(sway) * 0.75, background: `linear-gradient(270deg, ${C.red}, rgba(242,44,61,0) 30%)`, mixBlendMode: 'screen' }} />
      {typeof children === 'function' ? children(t) : children}
    </AbsoluteFill>
  );
};

// ---------- abertura: use fones ----------

const INTRO = 140;

const Intro = () => {
  const frame = useCurrentFrame();
  const enter = useIn(8);
  const out = interpolate(frame, [INTRO - 26, INTRO], [1, 0], CLAMP);
  // o som "passa" de um lado para o outro
  const side = Math.sin(frame / 11);
  const wave = (dir, i) => {
    const strength = clamp01(dir * side);
    const phase = ((frame / 24 + i / 3) % 1);
    return (
      <div key={`${dir}${i}`} style={{
        position: 'absolute', top: '50%', left: '50%', width: 150 + phase * 260, height: 150 + phase * 260,
        marginLeft: -(150 + phase * 260) / 2 + dir * 200, marginTop: -(150 + phase * 260) / 2, borderRadius: '50%',
        border: `5px solid ${C.red}`, opacity: (1 - phase) * strength * 0.9,
        clipPath: dir < 0 ? 'inset(0 62% 0 0)' : 'inset(0 0 0 62%)',
      }} />
    );
  };
  return (
    <AbsoluteFill style={{ opacity: out, fontFamily: UI, color: C.white }}>
      <Img src={staticFile(`tour2/${frameAt(tour, 0.7)}`)} style={{ position: 'absolute', width: 1920, height: 1080, filter: 'blur(26px) brightness(.4)', transform: 'scale(1.08)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 44, opacity: enter, transform: `scale(${0.94 + enter * 0.06})` }}>
        <div style={{ position: 'relative', width: 300, height: 300, display: 'grid', placeItems: 'center' }}>
          {[0, 1, 2].map(i => wave(-1, i))}
          {[0, 1, 2].map(i => wave(1, i))}
          <div style={{ width: 220, height: 220, borderRadius: '50%', background: C.s2, border: `3px solid ${C.border}`, display: 'grid', placeItems: 'center', transform: `translateX(${side * 10}px) scale(${1 + Math.abs(side) * 0.04})` }}>
            <Icon icon={HeadphonesIcon} size={120} color={C.white} />
          </div>
          {[['L', -1], ['R', 1]].map(([label, dir]) => (
            <div key={label} style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: dir * 250 - 30, marginTop: -30, width: 60, height: 60, borderRadius: '50%', display: 'grid', placeItems: 'center', font: `700 28px/1 ${DISPLAY}`, background: clamp01(dir * side) > 0.5 ? C.red : C.s3, color: C.white, opacity: 0.45 + clamp01(dir * side) * 0.55 }}>{label}</div>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: `700 92px/1.05 ${DISPLAY}`, letterSpacing: '-0.02em' }}>Use <span style={{ color: C.red }}>headphones</span></div>
          <div style={{ font: `500 40px/1.3 ${UI}`, color: C.t2, marginTop: 14 }}>for the best experience</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- cartão do efeito em vigor ----------

const BARS = 28;

const Meter = ({ t, state }) => {
  const frame = useCurrentFrame();
  const { level, pan } = soundAt(t);
  const depth = state.depth || 0;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 120 }}>
      {Array.from({ length: BARS }, (_, i) => {
        const wobble = 0.5 + 0.5 * Math.sin(frame * 0.42 + i * 1.7) * Math.sin(frame * 0.19 + i * 0.83);
        // abafado: as barras da direita (agudos) encolhem
        const cut = clamp01((i / BARS - (1 - depth * 0.78)) * 5);
        // 8D: o lado em que o som está fica mais alto
        const side = state.spin ? 0.35 + 0.65 * clamp01(1 - Math.abs((i / (BARS - 1)) * 2 - 1 - pan)) : 1;
        const height = 8 + 112 * level * (0.35 + 0.65 * wobble) * (1 - cut * 0.92) * side;
        return <div key={i} style={{ width: 16, height, borderRadius: 5, background: cut > 0.5 ? C.n600 : i % 5 === 2 ? C.red : C.white }} />;
      })}
    </div>
  );
};

const Orbit = ({ t }) => {
  const { pan } = soundAt(t);
  return (
    <div style={{ position: 'relative', height: 64, margin: '4px 0 22px' }}>
      <div style={{ position: 'absolute', left: 56, right: 56, top: 30, height: 4, borderRadius: 4, background: C.n600 }} />
      {[['L', 0, -pan], ['R', 1, pan]].map(([label, right, on]) => (
        <div key={label} style={{ position: 'absolute', top: 10, [right ? 'right' : 'left']: 0, width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', font: `700 20px/1 ${DISPLAY}`, background: on > 0.45 ? C.red : C.s3, color: C.white }}>{label}</div>
      ))}
      <div style={{ position: 'absolute', top: 8, left: `calc(50% + ${pan * 290}px - 24px)`, width: 48, height: 48, borderRadius: '50%', background: C.white, display: 'grid', placeItems: 'center', boxShadow: `0 0 34px ${C.red}` }}>
        <Icon icon={HeadphonesIcon} size={28} color={C.black} />
      </div>
    </div>
  );
};

const FxCard = ({ t }) => {
  const { now, index } = stateAt(t);
  if (index < 0) return null;
  const show = clamp01((t - STATES[0].at) / 0.5) * clamp01((M['fx-close'] + CLICK + 0.6 - t) / 0.5);
  const swap = clamp01((t - now.at) / 0.35);
  return (
    <div style={{
      position: 'absolute', left: 70, top: 236, width: 800, padding: '40px 44px 36px', borderRadius: 32, opacity: show, transform: `translateX(${(1 - show) * -50}px)`,
      background: 'rgba(11,11,12,.94)', border: `2px solid ${C.border}`, boxShadow: '0 30px 90px rgba(0,0,0,.7)', color: C.white, fontFamily: UI,
    }}>
      <div style={{ ...EYEBROW, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: C.red }} />Now playing with
      </div>
      <div style={{ opacity: swap, transform: `translateY(${(1 - swap) * 18}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 20, flexWrap: 'wrap' }}>
          <div style={{ font: `700 84px/1 ${DISPLAY}`, letterSpacing: '-0.02em' }}>{now.title}</div>
          <div style={{ padding: '10px 22px', borderRadius: 999, background: C.red, font: `600 30px/1.2 ${UI}`, whiteSpace: 'nowrap' }}>{now.preset}</div>
        </div>
        <div style={{ font: `500 34px/1.3 ${UI}`, color: C.t2, margin: '18px 0 30px' }}>{now.line}</div>
      </div>
      {now.spin ? <Orbit t={t} /> : null}
      <Meter t={t} state={now} />
      <div style={{ font: `500 22px/1.3 ${UI}`, color: C.t3, marginTop: 26 }}>Works on Spotify and YouTube tracks. Every preset is adjustable.</div>
    </div>
  );
};

// ---------- cenas ----------

// 1) busca: mais rápida que o real, ainda sem música
const A = { from: 0.6, to: M.plain - 0.3, rate: 1.25 };
const fA = t => Math.round(((t - A.from) / A.rate) * FPS);
const LEN_A = fA(A.to);
const DROP = { x: 1003, y: 330 }; // a lista de resultados da busca

const Search = () => (
  <Shot meta={tour} dir="tour2" {...A} cam={[{ f: 0, z: 1, x: 960, y: 540 }, { f: fA(M.search), z: 1, x: 960, y: 540 }, { f: fA(M.search + 2), z: 1.4, ...DROP }]}>
    <Caption from={fA(M.search + 0.6)} to={fA(M['youtube-tab'] + 0.4)}>Search <Red>Spotify</Red>…</Caption>
    <Caption from={fA(M['youtube-tab'] + CLICK)} to={fA(M.like + 0.2)}>…or <Red>YouTube</Red>. Same search box.</Caption>
    <Caption from={fA(M.like + CLICK)} to={fA(M.play + 0.5)}>Like a song <Red>right from the results</Red>.</Caption>
  </Shot>
);

// 2) a música e os efeitos, em tempo real, com o som do app
const B = { from: A.to, to: M['artist-search'] - 0.2, rate: 1 };
const fB = t => Math.round((t - B.from) * FPS);
const LEN_B = fB(B.to);
const PANEL = { x: 1300, y: 760 }; // o painel de efeitos fica à direita; o cartão ocupa a esquerda

const Effects = () => (
  <Shot meta={tour} dir="tour2" {...B} effects cam={[
    { f: 0, z: 1.4, ...DROP }, { f: 50, z: 1, x: 960, y: 540 }, { f: fB(M['fx-open'] + 0.4), z: 1, x: 960, y: 540 },
    { f: fB(M.muffled), z: 1.3, ...PANEL }, { f: fB(M['fx-close'] + 0.4), z: 1.3, ...PANEL }, { f: LEN_B, z: 1, x: 960, y: 540 },
  ]}>
    {t => (
      <>
        <Caption from={36} to={fB(M['fx-open'] + 0.3)}>Found on YouTube. <Red>Playing in ALL MUSIC.</Red></Caption>
        <FxCard t={t} />
      </>
    )}
  </Shot>
);

// 3) perfil de artista e álbum (regravado à parte; a música segue por baixo)
const D = { from: 1.0, to: MB['back-home'], rate: 1 };
const fD = t => Math.round((t - D.from) * FPS);
const LEN_D = fD(D.to);
const CROSS = 14;

const ArtistPages = () => {
  const opacity = interpolate(useCurrentFrame(), [0, CROSS], [0, 1], CLAMP);
  return (
    <AbsoluteFill style={{ opacity }}>
      <Shot meta={tourB} dir="tour2b" {...D}>
        <Caption from={fD(MB['all-results'] + 1.2)} to={fD(MB.artist + CLICK)}>Artist names are now <Red>links</Red>.</Caption>
        <Caption from={fD(MB['artist-open'] + 0.2)} to={fD(MB.discography)}><Red>Artist pages:</Red> the top tracks…</Caption>
        <Caption from={fD(MB.discography + 0.4)} to={fD(MB.album + 0.6)}>…and the full <Red>discography</Red>.</Caption>
        <Caption from={fD(MB['album-open'] + 0.2)} to={LEN_D - 4}>Open any <Red>album</Red> and press play.</Caption>
      </Shot>
    </AbsoluteFill>
  );
};

// 4) encerramento
const E = { from: D.to, to: tourB.duration, rate: 0.5 };
const LEN_E = 250;

const End = () => {
  const t = useIn(30);
  return (
    <Shot meta={tourB} dir="tour2b" {...E}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, display: 'flex', justifyContent: 'center', opacity: t, transform: `translateY(${(1 - t) * 40}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, padding: '30px 48px', borderRadius: 34, background: 'rgba(11,11,12,.96)', border: `2px solid ${C.border}`, boxShadow: '0 30px 90px rgba(0,0,0,.7)', color: C.white, fontFamily: UI }}>
          <Img src={staticFile('logo.png')} style={{ width: 124, height: 124 }} />
          <div>
            <div style={{ font: `700 76px/1 ${DISPLAY}`, letterSpacing: '-0.02em' }}>ALL MUSIC</div>
            <div style={{ font: `500 32px/1.3 ${UI}`, color: C.t2, marginTop: 10 }}>Spotify and YouTube in one queue. <span style={{ color: C.white }}>Free and open source.</span></div>
            <div style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', borderRadius: 999, background: C.red, font: `600 26px/1.2 ${UI}` }}>github.com/Artxxx3/allmusic</div>
            <div style={{ font: `400 17px/1.4 ${UI}`, color: C.t3, marginTop: 12 }}>Independent project, not affiliated with Spotify or YouTube.</div>
          </div>
        </div>
      </div>
    </Shot>
  );
};

// ---------- montagem ----------

const START_A = INTRO - 26;
const START_B = START_A + LEN_A;
const START_D = START_B + LEN_B - CROSS;
const START_E = START_D + LEN_D;
export const DEMO4_DURATION = START_E + LEN_E;
const MUSIC = DEMO4_DURATION - START_B;

export const Demo4 = () => (
  <AbsoluteFill style={{ background: C.black }}>
    <Sequence from={START_A} durationInFrames={LEN_A}><Search /></Sequence>
    <Sequence from={START_B} durationInFrames={LEN_B}><Effects /></Sequence>
    <Sequence from={START_D} durationInFrames={LEN_D}><ArtistPages /></Sequence>
    <Sequence from={START_E} durationInFrames={LEN_E}><End /></Sequence>
    <Sequence durationInFrames={INTRO}><Intro /></Sequence>
    <Sequence from={START_B} durationInFrames={MUSIC}>
      <Audio src={staticFile('fx-audio.wav')} startFrom={Math.round((B.from - tour.audioStart) * FPS)}
        volume={f => interpolate(f, [MUSIC - 80, MUSIC - 6], [1, 0], CLAMP)} />
    </Sequence>
  </AbsoluteFill>
);
