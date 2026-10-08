// Vídeo de apresentação (versão 2), editado sobre a gravação de tela video/public/raw2.mp4.
// Regras desta versão: a tela gravada fica sempre ao fundo, nenhuma janela é cortada
// (zoom só quando a janela em foco cabe inteira) e as cenas se cruzam devagar.
// Tempos de origem em segundos; posições em pixels da tela gravada (1920x1080).
import React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, DISPLAY, UI } from './Promo.jsx';

export const FADE = 24; // quadros de fusão entre cenas
export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
export const EASE = { easing: Easing.inOut(Easing.cubic), ...CLAMP };

// Memória lida no Gerenciador de Tarefas da própria gravação (MB), todas no mesmo instante (105 s):
// Spotify 740,7 · Chrome 1.069,0 · allmusic 64,3 · WebView2 299,6. O motor de áudio é estimado.
export const RAM = { spotify: 741, chrome: 1069, app: 64, webview: 300, engine: 10 };
const TM_AT = 105.3; // esse instante, quase congelado, serve de fundo para todas as cenas de memória
export const OURS = RAM.app + RAM.webview + RAM.engine;
export const THEIRS = RAM.spotify + RAM.chrome;

export function useIn(delay = 0, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
}

export const Rise = ({ delay = 0, y = 30, style, children }) => {
  const t = useIn(delay);
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * y}px)`, ...style }}>{children}</div>;
};

/** A tela gravada, em quadro cheio. `cam`: quadros-chave { f, z, x, y } de zoom e foco. */
const Screen = ({ from, rate = 1, cam, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const keys = cam || [{ f: 0, z: 1, x: 960, y: 540 }];
  const at = key => (keys.length === 1 ? keys[0][key] : interpolate(frame, keys.map(k => k.f), keys.map(k => k[key]), EASE));
  const z = at('z');
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - at('x') * z));
  const ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - at('y') * z));
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.black }}>
      <div style={{ position: 'absolute', width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <OffthreadVideo src={staticFile('raw2.mp4')} startFrom={Math.round(from * fps)} playbackRate={rate} muted style={{ width: 1920, height: 1080 }} />
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** Moldura de destaque numa área da tela (acompanha o zoom). */
const Box = ({ x, y, w, h, delay = 0, radius = 6 }) => {
  const t = useIn(delay, 18);
  return <div style={{ position: 'absolute', left: x - 4, top: y - 4, width: w + 8, height: h + 8, borderRadius: radius, border: `3px solid ${C.red}`, background: C.redSoft, opacity: t, transform: `scale(${1.04 - 0.04 * t})` }} />;
};

/** Escurece a tela em volta de uma área, para levar o olho até o clique. */
const Spotlight = ({ x, y, w, h, from, to, radius = 24 }) => {
  const t = interpolate(useCurrentFrame(), [from, from + 14, to - 14, to], [0, 1, 1, 0], CLAMP);
  return <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, boxShadow: `0 0 0 4000px rgba(8,8,8,${0.62 * t})`, border: `3px solid rgba(242,44,61,${t})` }} />;
};

/** Marca de clique: ponto e anel que se expande. */
const Click = ({ x, y, at }) => {
  const t = interpolate(useCurrentFrame(), [at, at + 20], [0, 1], CLAMP);
  if (t <= 0 || t >= 1) return null;
  const size = 28 + t * 84;
  return (
    <>
      <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%', border: `4px solid ${C.red}`, opacity: 1 - t }} />
      <div style={{ position: 'absolute', left: x - 10, top: y - 10, width: 20, height: 20, borderRadius: '50%', background: C.red, opacity: 1 - t * t }} />
    </>
  );
};

/** Legenda em faixa sólida, legível sobre qualquer tela. */
export const Caption = ({ from = 0, to = 99999, children }) => {
  const t = interpolate(useCurrentFrame(), [from, from + 12, to - 10, to], [0, 1, 1, 0], CLAMP);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 84, display: 'flex', justifyContent: 'center', opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
      <div style={{ padding: '20px 40px', borderRadius: 22, background: 'rgba(11,11,12,.94)', border: `2px solid ${C.border}`, font: `700 46px/1.2 ${DISPLAY}`, letterSpacing: '-0.02em', color: C.white, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        {children}
      </div>
    </div>
  );
};

export const Red = ({ children }) => <span style={{ color: C.red }}>{children}</span>;
export const EYEBROW = { font: `600 20px/1 ${DISPLAY}`, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.t3 };
const fmt = n => Math.round(n).toLocaleString('en-US');

/** Painel sólido para números e gráficos, posto sobre a área vazia da tela. */
const Panel = ({ delay = 8, style, children }) => {
  const t = useIn(delay);
  return (
    <div style={{ position: 'absolute', left: 1010, top: 250, width: 820, padding: 48, borderRadius: 32, background: 'rgba(18,18,20,.96)', border: `2px solid ${C.border}`, boxShadow: '0 40px 100px rgba(0,0,0,.6)', color: C.white, fontFamily: UI, opacity: t, transform: `translateX(${(1 - t) * 60}px)`, ...style }}>
      {children}
    </div>
  );
};

/** Número que conta até o valor. */
const Count = ({ to, delay = 0, decimals = 0, prefix = '', suffix = ' MB', style }) => {
  const value = interpolate(useCurrentFrame(), [delay, delay + 36], [0, to], { easing: Easing.out(Easing.cubic), ...CLAMP });
  return <div style={{ font: `700 132px/1 ${DISPLAY}`, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...style }}>{prefix}{decimals ? value.toFixed(decimals) : fmt(value)}{suffix}</div>;
};

const Bar = ({ label, value, max, delay, color = C.white, note }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 34], [0, 1], { easing: Easing.out(Easing.cubic), ...CLAMP });
  const show = interpolate(frame, [delay - 4, delay + 6], [0, 1], CLAMP);
  return (
    <div style={{ opacity: show, marginTop: 30 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', font: `600 28px/1.2 ${UI}` }}>
        <span>{label}</span>
        <span style={{ font: `700 34px/1 ${DISPLAY}`, fontVariantNumeric: 'tabular-nums', color }}>{fmt(value * t)} MB</span>
      </div>
      <div style={{ height: 22, borderRadius: 11, background: C.s3, marginTop: 12, overflow: 'hidden' }}>
        <div style={{ width: `${(value / max) * 100 * t}%`, height: '100%', borderRadius: 11, background: color }} />
      </div>
      {note && <div style={{ font: `400 20px/1.3 ${UI}`, color: C.t3, marginTop: 8 }}>{note}</div>}
    </div>
  );
};

// Linhas do Gerenciador de Tarefas (maximizado) nos trechos usados
const ROW = { x: 50, w: 722, h: 28 };
const ZOOM_APP = [{ f: 0, z: 1, x: 960, y: 540 }, { f: 70, z: 1.2, x: 958, y: 505 }];

// ---------- 1. Spotify ----------
export const SpotifyApp = () => (
  <>
    <Screen from={93.2} />
    <Caption from={14}>You open <Red>Spotify</Red> for your library…</Caption>
  </>
);

// ---------- 2. Spotify no Gerenciador de Tarefas ----------
export const SpotifyRam = () => (
  <>
    <Screen from={TM_AT} rate={0.12}>
      <Box {...ROW} y={230} delay={20} />
    </Screen>
    <Panel delay={26}>
      <div style={EYEBROW}>Windows Task Manager</div>
      <div style={{ font: `700 56px/1.1 ${DISPLAY}`, letterSpacing: '-0.02em', marginTop: 16 }}>Spotify</div>
      <Count to={RAM.spotify} delay={34} style={{ marginTop: 12 }} />
      <div style={{ font: `400 26px/1.4 ${UI}`, color: C.t2, marginTop: 18 }}>of memory, just playing music.</div>
    </Panel>
  </>
);

// ---------- 3. YouTube no navegador (com anúncio) ----------
export const YouTubeAd = () => {
  const t = useIn(26);
  return (
    <>
      <Screen from={56.2}>
        {/* o anúncio é de terceiros: fica desfocado, mas a tela continua visível */}
        <div style={{ position: 'absolute', left: 14, top: 178, width: 1408, height: 800, backdropFilter: 'blur(16px)', background: 'rgba(8,8,8,.25)' }} />
        <div style={{ position: 'absolute', left: 60, top: 220, padding: '14px 22px', borderRadius: 12, background: C.red, color: C.white, font: `700 30px/1 ${DISPLAY}`, letterSpacing: '0.04em', opacity: t, transform: `scale(${0.9 + 0.1 * t})` }}>AD PLAYS FIRST</div>
      </Screen>
      <Caption from={12}>…and a <Red>browser tab</Red> for the songs it doesn't have.</Caption>
    </>
  );
};

// ---------- 4. o navegador no Gerenciador de Tarefas ----------
export const ChromeRam = () => (
  <>
    <Screen from={TM_AT} rate={0.12}>
      <Box {...ROW} y={173} delay={20} />
    </Screen>
    <Panel delay={26}>
      <div style={EYEBROW}>Windows Task Manager</div>
      <div style={{ font: `700 56px/1.1 ${DISPLAY}`, letterSpacing: '-0.02em', marginTop: 16 }}>Google Chrome</div>
      <Count to={RAM.chrome} delay={34} style={{ marginTop: 12 }} />
      <div style={{ font: `400 26px/1.4 ${UI}`, color: C.t2, marginTop: 18 }}>with the YouTube tab open.</div>
    </Panel>
  </>
);

// ---------- 5. a conta ----------
export const Total = () => (
  <>
    <Screen from={TM_AT} rate={0.12}>
      <Box {...ROW} y={173} delay={10} />
      <Box {...ROW} y={230} delay={16} />
    </Screen>
    <Panel delay={10} style={{ top: 190 }}>
      <div style={EYEBROW}>Just to listen to music</div>
      <Bar label="Google Chrome (YouTube)" value={RAM.chrome} max={THEIRS} delay={24} />
      <Bar label="Spotify" value={RAM.spotify} max={THEIRS} delay={40} />
      <div style={{ height: 2, background: C.border, margin: '36px 0 28px' }} />
      <Rise delay={70} style={{ ...EYEBROW, color: C.t2 }}>Together</Rise>
      <Count to={THEIRS / 1024} decimals={1} delay={74} suffix=" GB" style={{ marginTop: 10, color: C.red }} />
    </Panel>
  </>
);

// ---------- 6. ALL MUSIC ----------
const Reveal = () => (
  <>
    <Screen from={3.4} cam={ZOOM_APP} />
    <Caption from={20}><Red>ALL MUSIC</Red> puts both in one small app.</Caption>
  </>
);

// ---------- 7. colar o link ----------
const Paste = () => (
  <>
    <Screen from={69.7}>
      <Spotlight x={740} y={98} w={500} h={50} from={8} to={92} />
      <Click x={990} y={122} at={34} />
      <Box x={332} y={214} w={1260} h={34} delay={118} radius={10} />
    </Screen>
    <Caption from={10} to={96}>Paste a <Red>YouTube link</Red> in the search box.</Caption>
    <Caption from={104}>It just plays. <Red>Audio only:</Red> no video, no tab.</Caption>
  </>
);

// ---------- 8. a mesma fila ----------
const Queue = () => (
  <>
    <Screen from={19.4} rate={0.85} cam={ZOOM_APP}>
      <Box x={1336} y={217} w={34} h={22} delay={40} />
    </Screen>
    <Caption from={14}><Red>YouTube</Red> and Spotify tracks in the same queue.</Caption>
  </>
);

// ---------- 9. a tela inicial ----------
const Home = () => (
  <>
    <Screen from={137.6} />
    <Caption from={14}>Your stats, top artists and history.</Caption>
  </>
);

// ---------- 10. a comparação ----------
export const Verdict = () => (
  <>
    <Screen from={TM_AT} rate={0.12}>
      <Box {...ROW} y={315} delay={14} />
      <Box {...ROW} y={567} delay={20} />
    </Screen>
    <Panel delay={12} style={{ top: 150 }}>
      <div style={EYEBROW}>Same PC · memory in use</div>
      <Bar label="Spotify + Chrome" value={THEIRS} max={THEIRS} delay={26} />
      <Bar label="ALL MUSIC" value={OURS} max={THEIRS} delay={46} color={C.red} note={`App ${RAM.app} + WebView2 ${RAM.webview} + audio engine ~${RAM.engine} MB, with a YouTube track loaded.`} />
      <div style={{ height: 2, background: C.border, margin: '36px 0 28px' }} />
      <Rise delay={84} style={{ font: `700 76px/1.05 ${DISPLAY}`, letterSpacing: '-0.02em' }}>About <Red>{Math.round(THEIRS / OURS)}× less</Red> memory.</Rise>
    </Panel>
  </>
);

// ---------- 11. encerramento ----------
const End = () => {
  const t = useIn(16);
  return (
    <>
      <Screen from={10.0} rate={0.6} cam={[{ f: 0, z: 1, x: 960, y: 540 }, { f: 90, z: 1.14, x: 958, y: 470 }]} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, display: 'flex', justifyContent: 'center', opacity: t, transform: `translateY(${(1 - t) * 40}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, padding: '28px 44px', borderRadius: 32, background: 'rgba(11,11,12,.95)', border: `2px solid ${C.border}`, boxShadow: '0 30px 80px rgba(0,0,0,.65)', color: C.white, fontFamily: UI }}>
          <Img src={staticFile('logo.png')} style={{ width: 112, height: 112 }} />
          <div>
            <div style={{ font: `700 72px/1 ${DISPLAY}`, letterSpacing: '-0.02em' }}>ALL MUSIC</div>
            <div style={{ font: `500 32px/1.3 ${UI}`, color: C.t2, marginTop: 10 }}>Spotify + YouTube, one queue. <span style={{ color: C.white }}>Free, one file, for Windows.</span></div>
            <div style={{ font: `400 18px/1.4 ${UI}`, color: C.t3, marginTop: 10 }}>Independent project, not affiliated with Spotify or YouTube. Spotify playback requires Premium.</div>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- montagem: cada cena entra em fusão lenta sobre a anterior ----------

const SCENES = [
  [SpotifyApp, 120], [SpotifyRam, 190], [YouTubeAd, 150], [ChromeRam, 170], [Total, 210],
  [Reveal, 170], [Paste, 215], [Queue, 150], [Home, 140], [Verdict, 240], [End, 190],
];
export const DEMO2_DURATION = SCENES.reduce((sum, [, length]) => sum + length, 0) - FADE * (SCENES.length - 1);

const FadeIn = ({ skip, children }) => {
  const opacity = skip ? 1 : interpolate(useCurrentFrame(), [0, FADE], [0, 1], CLAMP);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Demo2 = () => {
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
