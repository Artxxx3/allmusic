// Vídeo de apresentação editado a partir da gravação de tela (video/public/raw.mp4, 1920x1080).
// Cada tomada recorta uma janela da gravação, aplica zoom de câmera e marca os cliques.
// Tempos de origem em segundos; posições em pixels dentro do recorte.
import React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, DISPLAY, Disc, UI } from './Promo.jsx';

// Janelas na gravação
const TASKMGR = { x: 48, y: 124, w: 764, h: 584 };
const APP = { x: 320, y: 96, w: 1280, h: 828 };
const SCREEN = { x: 0, y: 0, w: 1920, h: 1080 };

const SHOTS = { hook: 60, spotify: 96, ours: 96, login: 84, ad: 66, paste: 93, queue: 96, end: 96 };
export const DEMO_DURATION = Object.values(SHOTS).reduce((a, b) => a + b, 0);

const EASE = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

function useIn(delay = 0, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
}

const Rise = ({ delay = 0, y = 36, style, children }) => {
  const t = useIn(delay);
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * y}px)`, ...style }}>{children}</div>;
};

/** Fundo + fade de entrada e de saída de cada tomada. */
const Stage = ({ length, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6, length - 6, length], [0, 1, 1, 0], CLAMP);
  return <AbsoluteFill style={{ background: C.bg, color: C.white, fontFamily: UI, opacity }}>{children}</AbsoluteFill>;
};

/**
 * Recorte da gravação com câmera. `cam` são quadros-chave { f, z, x, y }: zoom e ponto de foco
 * (em pixels do recorte). Os filhos são desenhados em coordenadas do recorte e acompanham o zoom.
 */
const Shot = ({ rect, base, from, rate = 1, cam, blur = 0, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const keys = cam || [{ f: 0, z: 1, x: rect.w / 2, y: rect.h / 2 }];
  const at = key => (keys.length === 1 ? keys[0][key] : interpolate(frame, keys.map(k => k.f), keys.map(k => k[key]), EASE));
  const scale = base * at('z');
  const width = rect.w * base;
  const height = rect.h * base;
  // mantém o foco no centro sem deixar aparecer borda vazia
  const tx = Math.min(0, Math.max(width - rect.w * scale, width / 2 - at('x') * scale));
  const ty = Math.min(0, Math.max(height - rect.h * scale, height / 2 - at('y') * scale));
  return (
    <div style={{ position: 'absolute', width, height, overflow: 'hidden', borderRadius: 22, border: `2px solid ${C.border}`, boxShadow: '0 40px 100px rgba(0,0,0,.65)', background: C.black, ...style }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: rect.w, height: rect.h, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <OffthreadVideo src={staticFile('raw.mp4')} startFrom={Math.round(from * fps)} playbackRate={rate} muted
          style={{ position: 'absolute', left: -rect.x, top: -rect.y, width: 1920, height: 1080, filter: blur ? `blur(${blur}px)` : undefined }} />
        {children}
      </div>
    </div>
  );
};

/** Marca de clique: um ponto e um anel que se expande. */
const Click = ({ x, y, at }) => {
  const t = interpolate(useCurrentFrame(), [at, at + 16], [0, 1], CLAMP);
  if (t <= 0 || t >= 1) return null;
  const size = 26 + t * 70;
  return (
    <>
      <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%', border: `4px solid ${C.red}`, opacity: 1 - t }} />
      <div style={{ position: 'absolute', left: x - 9, top: y - 9, width: 18, height: 18, borderRadius: '50%', background: C.red, opacity: 1 - t * t }} />
    </>
  );
};

/** Moldura de destaque sobre uma área do recorte. */
const Box = ({ x, y, w, h, delay = 0 }) => {
  const t = useIn(delay, 16);
  return <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 6, border: `3px solid ${C.red}`, background: C.redSoft, opacity: t, transform: `scale(${1.06 - 0.06 * t})` }} />;
};

const Caption = ({ from = 0, to = 9999, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, from + 8, to - 6, to], [0, 1, 1, 0], CLAMP);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26, textAlign: 'center', opacity: t, transform: `translateY(${(1 - t) * 18}px)`, font: `700 54px/1.15 ${DISPLAY}`, letterSpacing: '-0.02em' }}>
      {children}
    </div>
  );
};

const Red = ({ children }) => <span style={{ color: C.red }}>{children}</span>;
const EYEBROW = { font: `600 22px/1 ${DISPLAY}`, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.t3 };
const APP_FRAME = { base: 1.16, style: { left: (1920 - APP.w * 1.16) / 2, top: 14 } };

// ---------- 1. gancho ----------

const Hook = () => (
  <Stage length={SHOTS.hook}>
    <AbsoluteFill style={{ padding: '0 170px', justifyContent: 'center' }}>
      <Rise delay={2} style={{ font: `700 116px/1.04 ${DISPLAY}`, letterSpacing: '-0.02em' }}>How much RAM</Rise>
      <Rise delay={10} style={{ font: `700 116px/1.04 ${DISPLAY}`, letterSpacing: '-0.02em' }}>does your <Red>music</Red> cost?</Rise>
    </AbsoluteFill>
  </Stage>
);

// ---------- 2 e 3. Gerenciador de Tarefas ----------

const Meter = ({ eyebrow, name, value, note, delay = 14, accent }) => (
  <div style={{ position: 'absolute', left: 1270, right: 80, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
    <Rise delay={delay} style={EYEBROW}>{eyebrow}</Rise>
    <Rise delay={delay + 4} style={{ font: `700 64px/1.1 ${DISPLAY}`, letterSpacing: '-0.02em', marginTop: 14 }}>{name}</Rise>
    <Rise delay={delay + 10} style={{ font: `700 150px/1 ${DISPLAY}`, letterSpacing: '-0.03em', marginTop: 10, color: accent ? C.red : C.white, whiteSpace: 'nowrap' }}>{value}</Rise>
    <Rise delay={delay + 18} style={{ font: `400 28px/1.4 ${UI}`, color: C.t2, marginTop: 18 }}>{note}</Rise>
  </div>
);

const TM_FRAME = { base: 1.45, style: { left: 90, top: (1080 - TASKMGR.h * 1.45) / 2 } };

const SpotifyRam = () => (
  <Stage length={SHOTS.spotify}>
    <Shot rect={TASKMGR} from={14.2} {...TM_FRAME} cam={[{ f: 0, z: 1, x: 382, y: 292 }, { f: 30, z: 1.45, x: 330, y: 190 }]}>
      <Box x={52} y={156} w={700} h={28} delay={22} />
    </Shot>
    <Meter eyebrow="Windows Task Manager" name="Spotify" value="820 MB" note="Just playing music." />
  </Stage>
);

const OurRam = () => (
  <Stage length={SHOTS.ours}>
    <Shot rect={TASKMGR} from={38.3} rate={0.45} {...TM_FRAME} cam={[{ f: 0, z: 1, x: 382, y: 292 }, { f: 30, z: 1.3, x: 350, y: 420 }]}>
      <Box x={52} y={296} w={700} h={28} delay={22} />
      <Box x={52} y={492} w={700} h={28} delay={30} />
    </Shot>
    <Meter accent eyebrow="Same PC, same song" name="ALL MUSIC" value="≈ 210 MB" note="App + WebView2 + audio engine." />
  </Stage>
);

// ---------- 4. login ----------

const Login = () => {
  const frame = useCurrentFrame();
  return (
    <Stage length={SHOTS.login}>
      {frame < 38 ? (
        <Shot rect={APP} from={27.3} {...APP_FRAME} cam={[{ f: 0, z: 1, x: 640, y: 414 }, { f: 16, z: 1.6, x: 1060, y: 470 }]}>
          <Click x={1026} y={550} at={20} />
        </Shot>
      ) : (
        <Sequence from={38}>
          <Shot rect={APP} from={32.8} rate={0.7} {...APP_FRAME} cam={[{ f: 0, z: 1.25, x: 640, y: 330 }, { f: 30, z: 1, x: 640, y: 414 }]} />
        </Sequence>
      )}
      <Caption>One click. <Red>You're in.</Red></Caption>
    </Stage>
  );
};

// ---------- 5. o anúncio do YouTube ----------

const Ad = () => (
  <Stage length={SHOTS.ad}>
    <Shot rect={SCREEN} from={43.6} base={1} blur={22} style={{ left: 0, top: 0, borderRadius: 0, border: 'none' }} />
    <AbsoluteFill style={{ background: 'rgba(8,8,8,.72)', alignItems: 'center', justifyContent: 'center' }}>
      <Rise delay={4} style={{ ...EYEBROW, color: C.white, padding: '10px 18px', borderRadius: 8, background: C.n600 }}>Ad · 0:05</Rise>
      <Rise delay={8} style={{ font: `700 104px/1.06 ${DISPLAY}`, letterSpacing: '-0.02em', marginTop: 28, textAlign: 'center' }}>On YouTube,<br />the ad plays first.</Rise>
    </AbsoluteFill>
  </Stage>
);

// ---------- 6. colar o link ----------

const Paste = () => (
  <Stage length={SHOTS.paste}>
    <Shot rect={APP} from={51.2} {...APP_FRAME}
      cam={[{ f: 0, z: 1.9, x: 670, y: 60 }, { f: 30, z: 1.9, x: 670, y: 60 }, { f: 52, z: 1.25, x: 640, y: 200 }, { f: 93, z: 1.12, x: 640, y: 330 }]}>
      <Click x={690} y={36} at={6} />
    </Shot>
    <Caption from={0} to={46}>Paste the YouTube link.</Caption>
    <Caption from={46}>It just plays. <Red>No video. No tab.</Red></Caption>
  </Stage>
);

// ---------- 7. a mesma fila ----------

const Queue = () => {
  const frame = useCurrentFrame();
  const cam = [{ f: 0, z: 1.3, x: 600, y: 240 }];
  return (
    <Stage length={SHOTS.queue}>
      {frame < 48 ? (
        <Shot rect={APP} from={57.8} {...APP_FRAME} cam={cam}>
          <Click x={420} y={200} at={14} />
        </Shot>
      ) : (
        <Sequence from={48}>
          <Shot rect={APP} from={62.9} {...APP_FRAME} cam={cam}>
            <Click x={536} y={144} at={14} />
            <Box x={822} y={132} w={38} h={24} delay={22} />
          </Shot>
        </Sequence>
      )}
      <Caption from={0} to={48}>A Spotify track…</Caption>
      <Caption from={48}>…then a YouTube one. <Red>Same queue.</Red></Caption>
    </Stage>
  );
};

// ---------- 8. encerramento ----------

const End = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.black, color: C.white, fontFamily: UI, alignItems: 'center', justifyContent: 'center', opacity: interpolate(frame, [0, 8], [0, 1], CLAMP) }}>
      <Rise delay={0}><Disc size={300} spin={frame * 1.2} /></Rise>
      <Rise delay={8} style={{ font: `700 132px/1.04 ${DISPLAY}`, letterSpacing: '-0.02em', marginTop: 44 }}>ALL MUSIC</Rise>
      <Rise delay={16} style={{ font: `500 42px/1.3 ${UI}`, color: C.t2, marginTop: 8 }}>Spotify + YouTube. <span style={{ color: C.white }}>One queue.</span></Rise>
      <Rise delay={28} style={{ marginTop: 44, height: 92, padding: '0 44px', borderRadius: 999, background: C.white, color: C.black, font: `600 34px/92px ${UI}` }}>Free. One file. For Windows.</Rise>
      <Rise delay={40} style={{ position: 'absolute', bottom: 50, font: `400 22px/1.4 ${UI}`, color: C.t3 }}>
        Independent project, not affiliated with Spotify or YouTube. Spotify playback requires Premium.
      </Rise>
    </AbsoluteFill>
  );
};

export const Demo = () => {
  let at = 0;
  const shots = [[Hook, SHOTS.hook], [SpotifyRam, SHOTS.spotify], [OurRam, SHOTS.ours], [Login, SHOTS.login], [Ad, SHOTS.ad], [Paste, SHOTS.paste], [Queue, SHOTS.queue], [End, SHOTS.end]];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {shots.map(([Component, length], i) => {
        const from = at;
        at += length;
        return <Sequence key={i} from={from} durationInFrames={length}><Component /></Sequence>;
      })}
    </AbsoluteFill>
  );
};
