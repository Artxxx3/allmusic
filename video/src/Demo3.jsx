// Vídeo de apresentação (versão 3): comparação de memória com Spotify + Chrome (trechos da
// gravação de tela raw2.mp4) seguida de um passeio pelo app capturado direto da janela dele
// (video/public/tour, gerado por tools/video/record.mjs), o gráfico final e a chamada.
import React from 'react';
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import tour from '../public/tour/meta.json';
import { C, DISPLAY, UI } from './Promo.jsx';
import { CLAMP, Caption, ChromeRam, EASE, FADE, Red, SpotifyApp, SpotifyRam, Total, Verdict, YouTubeAd, useIn } from './Demo2.jsx';

/** Quadro do passeio no instante t (segundos): o último capturado até ali. */
function frameAt(t) {
  const frames = tour.frames;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo].file;
}

/**
 * Trecho do passeio, de `from` a `to` segundos, tocado na velocidade `rate`.
 * `cam`: quadros-chave { f, z, x, y } de zoom e foco, em pixels do quadro (1920x1080).
 */
const Tour = ({ from, to, rate = 1, cam }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = Math.min(to, from + (frame / fps) * rate);
  const keys = cam || [{ f: 0, z: 1, x: 960, y: 540 }];
  const at = key => (keys.length === 1 ? keys[0][key] : interpolate(frame, keys.map(k => k.f), keys.map(k => k[key]), EASE));
  const z = at('z');
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - at('x') * z));
  const ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - at('y') * z));
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.black }}>
      <Img src={staticFile('tour/' + frameAt(t))} style={{ position: 'absolute', width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }} />
    </AbsoluteFill>
  );
};

/** Duração em quadros de um trecho do passeio na velocidade dada (mais a fusão com a cena seguinte). */
const span = (from, to, rate) => Math.round(((to - from) / rate) * 30) + FADE;

const M = tour.marks; // instantes das ações, gravados junto com o passeio

// ---------- o app ----------

const T_HOME = { from: 0.4, to: M.liked - 0.1, rate: 1.15 };
const Home = () => (
  <>
    <Tour {...T_HOME} />
    <Caption from={16}>Meet <Red>ALL MUSIC</Red>. One small app for both.</Caption>
  </>
);

const T_LIKED = { from: M.liked - 0.1, to: M.search - 0.1, rate: 1.2 };
const Liked = () => (
  <>
    <Tour {...T_LIKED} cam={[{ f: 0, z: 1, x: 960, y: 540 }, { f: 70, z: 1.14, x: 860, y: 470 }]} />
    <Caption from={18}>Spotify and <Red>YouTube</Red> tracks, side by side.</Caption>
  </>
);

const T_SEARCH = { from: M.search - 0.1, to: M.paste - 0.1, rate: 1.2 };
const Search = () => {
  const played = Math.round(((M['search-play'] - T_SEARCH.from) / T_SEARCH.rate) * 30);
  return (
    <>
      <Tour {...T_SEARCH} cam={[{ f: 0, z: 1.14, x: 860, y: 470 }, { f: 40, z: 1.5, x: 680, y: 300 }, { f: played - 10, z: 1.5, x: 680, y: 300 }, { f: played + 40, z: 1, x: 960, y: 540 }]} />
      <Caption from={14} to={played}>Search as you type.</Caption>
      <Caption from={played + 4}>One click and <Red>it plays.</Red></Caption>
    </>
  );
};

const T_PASTE = { from: M.paste - 0.1, to: M.queue - 0.1, rate: 1.1 };
const Paste = () => {
  const played = Math.round(((M['youtube-play'] - T_PASTE.from) / T_PASTE.rate) * 30);
  return (
    <>
      <Tour {...T_PASTE} cam={[{ f: 0, z: 1, x: 960, y: 540 }, { f: 30, z: 1.3, x: 760, y: 230 }, { f: played + 20, z: 1.3, x: 760, y: 230 }, { f: played + 70, z: 1.1, x: 900, y: 420 }]} />
      <Caption from={8} to={played + 6}>
        Paste a <Red>YouTube link</Red>.
        <div style={{ font: `500 26px/1.2 ui-monospace, Consolas, monospace`, color: C.t2, marginTop: 10, letterSpacing: 0 }}>youtube.com/watch?v=t53IG6RWKwU</div>
      </Caption>
      <Caption from={played + 10}>It just plays. <Red>Audio only:</Red> no video, no tab.</Caption>
    </>
  );
};

const T_QUEUE = { from: M.queue - 0.1, to: M['back-home'] - 0.1, rate: 1.35 };
const Queue = () => (
  <>
    <Tour {...T_QUEUE} cam={[{ f: 0, z: 1.1, x: 900, y: 420 }, { f: 50, z: 1, x: 960, y: 540 }]} />
    <Caption from={14}>One queue. The next track can come from <Red>either</Red>.</Caption>
  </>
);

// ---------- encerramento ----------

const T_END = { from: M['back-home'] - 0.1, to: tour.duration, rate: 0.5 };
const End = () => {
  const t = useIn(40);
  return (
    <>
      <Tour {...T_END} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, display: 'flex', justifyContent: 'center', opacity: t, transform: `translateY(${(1 - t) * 40}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, padding: '30px 48px', borderRadius: 34, background: 'rgba(11,11,12,.96)', border: `2px solid ${C.border}`, boxShadow: '0 30px 90px rgba(0,0,0,.7)', color: C.white, fontFamily: UI }}>
          <Img src={staticFile('logo.png')} style={{ width: 124, height: 124 }} />
          <div>
            <div style={{ font: `700 76px/1 ${DISPLAY}`, letterSpacing: '-0.02em' }}>ALL MUSIC</div>
            <div style={{ font: `500 32px/1.3 ${UI}`, color: C.t2, marginTop: 10 }}>Free and open source. <span style={{ color: C.white }}>One file, for Windows.</span></div>
            <div style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', borderRadius: 999, background: C.red, font: `600 26px/1.2 ${UI}` }}>github.com/Artxxx3/allmusic</div>
            <div style={{ font: `400 17px/1.4 ${UI}`, color: C.t3, marginTop: 12 }}>Independent project, not affiliated with Spotify or YouTube. Spotify playback requires Premium.</div>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- montagem ----------

const SCENES = [
  [SpotifyApp, 120], [SpotifyRam, 180], [YouTubeAd, 140], [ChromeRam, 160], [Total, 200],
  [Home, span(T_HOME.from, T_HOME.to, T_HOME.rate)],
  [Liked, span(T_LIKED.from, T_LIKED.to, T_LIKED.rate)],
  [Search, span(T_SEARCH.from, T_SEARCH.to, T_SEARCH.rate)],
  [Paste, span(T_PASTE.from, T_PASTE.to, T_PASTE.rate)],
  [Queue, span(T_QUEUE.from, T_QUEUE.to, T_QUEUE.rate)],
  [Verdict, 220],
  [End, span(T_END.from, T_END.to, T_END.rate)],
];
export const DEMO3_DURATION = SCENES.reduce((sum, [, length]) => sum + length, 0) - FADE * (SCENES.length - 1);

const FadeIn = ({ skip, children }) => {
  const opacity = skip ? 1 : interpolate(useCurrentFrame(), [0, FADE], [0, 1], CLAMP);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Demo3 = () => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: C.black }}>
      {SCENES.map(([Component, length], i) => {
        const from = at;
        at += length - FADE;
        return (
          <Sequence key={i} from={from} durationInFrames={length}>
            <FadeIn skip={i === 0}><Component /></FadeIn>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
