// Vídeo de apresentação do ALL MUSIC (inglês, ~25 s, 1920x1080 a 30 fps).
// Cada cena é um componente; os tempos ficam em SCENES, em quadros.
import React from 'react';
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Cancel01Icon, CursorPointer01Icon, FavouriteIcon, HeadphonesIcon, NextIcon, PauseIcon,
  PreviousIcon, Search01Icon, File01Icon, HardDriveIcon, Download04Icon,
} from '@hugeicons/core-free-icons';

export const C = {
  black: '#080808', bg: '#0B0B0C', s1: '#121214', s2: '#18181B', s3: '#202024', border: '#29292E', subtle: '#1E1E22',
  white: '#F7F5F2', red: '#F22C3D', redSoft: 'rgba(242,44,61,.12)', n600: '#3A3A40', t2: '#B5B5BC', t3: '#8C8C94',
};
export const UI = 'Inter, sans-serif';
export const DISPLAY = '"Space Grotesk", Inter, sans-serif';

const SCENES = { hook: 100, tab: 95, reveal: 90, app: 225, trust: 120, cta: 120 };
export const DURATION = Object.values(SCENES).reduce((a, b) => a + b, 0);

// ---------- peças ----------

const Icon = ({ icon, size = 24, solid = false, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={solid ? color : 'none'} style={{ color, flex: 'none' }}>
    {icon.map(([Tag, { key, ...attrs }], i) => <Tag key={i} {...attrs} />)}
  </svg>
);

/** 0 → 1 com mola, começando em `delay` quadros. */
function useIn(delay = 0, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
}

/** Entrada de baixo para cima com fade. */
const Rise = ({ delay = 0, y = 40, style, children }) => {
  const t = useIn(delay);
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * y}px)`, ...style }}>{children}</div>;
};

/** Título que entra palavra por palavra. */
const Words = ({ text, delay = 0, gap = 4, style, accent }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '0.26em', ...style }}>
    {text.split(' ').map((word, i) => (
      <Rise key={i} delay={delay + i * gap} y={50} style={{ color: accent?.includes(word) ? C.red : undefined }}>{word}</Rise>
    ))}
  </div>
);

/** Cena: fundo + fade de saída nos últimos quadros. */
const Scene = ({ length, background = C.bg, children }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [length - 10, length], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background, color: C.white, fontFamily: UI, opacity: out }}>{children}</AbsoluteFill>;
};

const H1 = { font: `700 112px/1.04 ${DISPLAY}`, letterSpacing: '-0.02em' };
const EYEBROW = { font: `600 22px/1 ${DISPLAY}`, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.t3 };

const Chip = ({ icon, title, source, tone = 'dark', style }) => {
  const light = tone === 'light';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 22, padding: '18px 30px 18px 18px', borderRadius: 26,
      background: light ? C.white : C.s2, color: light ? C.black : C.white, border: `2px solid ${light ? C.white : C.border}`,
      boxShadow: '0 30px 70px rgba(0,0,0,.6)', ...style,
    }}>
      <div style={{ width: 76, height: 76, borderRadius: 16, display: 'grid', placeItems: 'center', background: light ? C.black : tone === 'red' ? C.red : C.white, color: light || tone === 'red' ? C.white : C.black }}>
        <Icon icon={icon} size={36} solid={tone === 'red'} />
      </div>
      <div>
        <div style={{ font: `600 30px/1.2 ${UI}`, whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ ...EYEBROW, fontSize: 17, marginTop: 8, color: light ? '#D91F30' : C.t3 }}>{source}</div>
      </div>
    </div>
  );
};

// ---------- 1. gancho ----------

const Hook = () => (
  <Scene length={SCENES.hook}>
    <AbsoluteFill style={{ padding: '0 160px', justifyContent: 'center' }}>
      <Words text="That one song" delay={6} style={H1} />
      <Words text="that's only on YouTube?" delay={22} style={H1} accent={['YouTube?']} />
    </AbsoluteFill>
    <Rise delay={48} style={{ position: 'absolute', right: 170, bottom: 190, rotate: '-3deg' }}>
      <Chip icon={HeadphonesIcon} title="The live version — 5:07" source="YouTube" />
    </Rise>
  </Scene>
);

// ---------- 2. a aba aberta ----------

const Tab = ({ label, active, width = 330, closing = 1 }) => (
  <div style={{
    width: width * closing, opacity: closing, overflow: 'hidden', height: 74, borderRadius: '18px 18px 0 0', flex: 'none',
    background: active ? C.s3 : C.s1, border: `2px solid ${C.border}`, borderBottom: 'none',
    display: 'flex', alignItems: 'center', gap: 14, padding: closing > 0.3 ? '0 22px' : 0, font: `500 24px/1 ${UI}`, color: active ? C.white : C.t3, whiteSpace: 'nowrap',
  }}>
    <span style={{ width: 22, height: 22, borderRadius: 6, background: active ? C.red : C.n600, flex: 'none' }} />
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    <Icon icon={Cancel01Icon} size={20} />
  </div>
);

const TabScene = () => {
  const frame = useCurrentFrame();
  const closing = interpolate(frame, [46, 62], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <Scene length={SCENES.tab}>
      <AbsoluteFill style={{ padding: '0 160px', justifyContent: 'center', gap: 70 }}>
        <Rise delay={2} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, borderBottom: `2px solid ${C.border}`, paddingLeft: 24 }}>
          <Tab label="Docs" />
          <Tab label="live version - YouTube" active width={470} closing={closing} />
          <Tab label="Game launcher" />
        </Rise>
        <div>
          <Words text="Stop keeping a tab open" delay={8} style={H1} />
          <Words text="just to listen." delay={26} style={{ ...H1, color: C.t3 }} />
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

// ---------- 3. a marca ----------

export const Disc = ({ size, spin = 0 }) => (
  <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.s1, border: `2px solid ${C.border}`, transform: `rotate(${spin}deg)` }}>
      {[0.1, 0.21].map(k => <div key={k} style={{ position: 'absolute', inset: size * k, borderRadius: '50%', border: `2px solid ${C.subtle}` }} />)}
      <div style={{ position: 'absolute', left: '50%', top: 10, width: 4, height: size * 0.09, background: C.border, borderRadius: 4 }} />
    </div>
    <div style={{ position: 'absolute', inset: size * 0.32, borderRadius: '50%', background: C.red, display: 'grid', placeItems: 'center' }}>
      <Img src={staticFile('logo.png')} style={{ width: size * 0.235, height: size * 0.235 }} />
    </div>
  </div>
);

const Reveal = () => {
  const frame = useCurrentFrame();
  const pop = useIn(0, 14);
  return (
    <Scene length={SCENES.reveal} background={C.black}>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 110 }}>
        <div style={{ transform: `scale(${pop})` }}><Disc size={520} spin={frame * 1.2} /></div>
        <div>
          <Rise delay={10} style={EYEBROW}>Meet</Rise>
          <Words text="ALL MUSIC" delay={14} style={{ ...H1, fontSize: 150, marginTop: 14 }} />
          <Rise delay={30} style={{ font: `500 46px/1.3 ${UI}`, color: C.t2, marginTop: 18 }}>
            Spotify + YouTube. <span style={{ color: C.white }}>One queue.</span>
          </Rise>
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

// ---------- 4. o app ----------

const TRACKS = [
  { title: 'Midnight Drive', artist: 'Nova Lane', time: '3:42', cover: '#5b3a3f' },
  { title: 'Paper Planets', artist: 'June Harbor', time: '2:58', cover: '#34404f' },
  { title: 'Slow Static', artist: 'The Quiet Hours', time: '4:11', cover: '#3d3550' },
  { title: 'Glass Summer', artist: 'Mara Vale', time: '3:20', cover: '#2f4a44' },
];
const PASTED = { title: 'Midnight Drive (Live at the Pier)', artist: 'Nova Lane', time: '5:07', cover: '#4a4636', yt: true };
const LINK = 'youtube.com/watch?v=live-at-the-pier';

const Row = ({ n, track, on, style }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '44px 72px 1.5fr 1fr 70px 90px 40px', alignItems: 'center', gap: 22,
    height: 96, padding: '0 22px', borderRadius: 16, background: on ? C.redSoft : 'transparent', font: `400 26px/1 ${UI}`, ...style,
  }}>
    <span style={{ color: on ? C.red : C.t3, textAlign: 'center', fontSize: 22 }}>{n}</span>
    <span style={{ width: 72, height: 72, borderRadius: 12, background: track.cover }} />
    <span style={{ fontWeight: 600, color: on ? C.red : C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</span>
    <span style={{ color: C.t2 }}>{track.artist}</span>
    {track.yt ? <span style={{ font: `600 17px/1 ${UI}`, padding: '7px 10px', borderRadius: 8, background: C.s3, color: C.t2, justifySelf: 'start' }}>YT</span> : <span />}
    <span style={{ color: C.t3, textAlign: 'right' }}>{track.time}</span>
    <Icon icon={FavouriteIcon} size={30} solid color={C.red} />
  </div>
);

const Caption = ({ from, to, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, from + 10, to - 8, to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center', opacity: t, transform: `translateY(${(1 - t) * 20}px)`, font: `700 62px/1.1 ${DISPLAY}`, letterSpacing: '-0.02em' }}>
      {children}
    </div>
  );
};

const AppScene = () => {
  const frame = useCurrentFrame();
  const enter = useIn(0);
  const typed = Math.round(interpolate(frame, [70, 112], [0, LINK.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const inserted = useIn(124, 18);                 // a faixa do YouTube entra na lista
  const playing = frame >= 124;                    // e passa a ser a faixa tocando
  const progress = interpolate(frame, [124, SCENES.app], [0.04, 0.34], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const now = playing ? PASTED : TRACKS[0];

  return (
    <Scene length={SCENES.app}>
      <div style={{
        position: 'absolute', left: 190, right: 190, top: 60, height: 800, borderRadius: 34, background: C.bg, border: `2px solid ${C.border}`,
        overflow: 'hidden', opacity: enter, transform: `translateY(${(1 - enter) * 60}px) scale(${0.96 + 0.04 * enter})`, boxShadow: '0 50px 120px rgba(0,0,0,.7)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* barra de título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 96, padding: '0 30px', flex: 'none' }}>
          <Img src={staticFile('logo.png')} style={{ width: 40, height: 40 }} />
          <b style={{ font: `700 26px/1 ${DISPLAY}` }}>ALL MUSIC</b>
          <div style={{
            margin: '0 auto', width: 760, height: 62, borderRadius: 999, background: C.s2, border: `2px solid ${typed ? C.t3 : C.border}`,
            display: 'flex', alignItems: 'center', gap: 16, padding: '0 26px', font: `400 26px/1 ${UI}`, color: typed ? C.white : C.t3,
          }}>
            <Icon icon={Search01Icon} size={28} />
            {typed ? LINK.slice(0, typed) : 'Search Spotify or paste a YouTube link'}
            {typed > 0 && typed < LINK.length && <span style={{ width: 3, height: 30, background: C.white }} />}
          </div>
          <span style={{ width: 150 }} />
        </div>

        {/* lista */}
        <div style={{ flex: 1, margin: '0 16px', padding: '22px 22px 0', borderRadius: 26, background: C.s1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 44, font: `600 26px/1 ${UI}`, color: C.t3, borderBottom: `2px solid ${C.subtle}`, marginBottom: 10 }}>
            {['Queue', 'Liked', 'Spotify', 'YouTube'].map((tab, i) => (
              <span key={tab} style={{ paddingBottom: 18, color: i === 1 ? C.white : C.t3, boxShadow: i === 1 ? `inset 0 -4px 0 ${C.red}` : 'none' }}>{tab}</span>
            ))}
          </div>
          <div style={{ height: 96 * inserted, opacity: inserted, overflow: 'hidden' }}>
            <Row n={1} track={PASTED} on />
          </div>
          {TRACKS.map((track, i) => {
            const t = spring({ frame: frame - 14 - i * 6, fps: 30, config: { damping: 200 } });
            return <Row key={track.title} n={i + 1 + Math.round(inserted)} track={track} on={!playing && i === 0 && frame > 40} style={{ opacity: t, transform: `translateY(${(1 - t) * 30}px)` }} />;
          })}
        </div>

        {/* player */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 30, height: 116, margin: 16, padding: '0 30px', borderRadius: 26, background: C.s1, flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
            <span style={{ width: 72, height: 72, borderRadius: 12, background: now.cover, flex: 'none' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: `600 26px/1.2 ${UI}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{now.title}</div>
              <div style={{ font: `400 21px/1.2 ${UI}`, color: C.t2 }}>{now.artist}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            <Icon icon={PreviousIcon} size={36} solid />
            <span style={{ width: 70, height: 70, borderRadius: '50%', background: C.white, color: C.black, display: 'grid', placeItems: 'center' }}><Icon icon={PauseIcon} size={34} solid /></span>
            <Icon icon={NextIcon} size={36} solid />
          </div>
          <div style={{ justifySelf: 'end', width: 320, height: 8, borderRadius: 8, background: C.n600, overflow: 'hidden' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: C.red }} />
          </div>
        </div>
      </div>

      <Caption from={18} to={70}>Your Spotify library.</Caption>
      <Caption from={70} to={140}>Paste a YouTube link.</Caption>
      <Caption from={140} to={SCENES.app}>Same queue. <span style={{ color: C.red }}>Audio only.</span></Caption>
    </Scene>
  );
};

// ---------- 5. confiança ----------

const Card = ({ icon, title, text, delay, accent }) => (
  <Rise delay={delay} y={70} style={{ flex: 1, padding: 54, borderRadius: 40, background: C.s1, border: `2px solid ${C.subtle}` }}>
    <div style={{ width: 104, height: 104, borderRadius: 28, display: 'grid', placeItems: 'center', background: accent ? C.redSoft : C.s2, color: accent ? C.red : C.white, border: accent ? 'none' : `2px solid ${C.border}` }}>
      <Icon icon={icon} size={50} />
    </div>
    <div style={{ font: `700 54px/1.1 ${DISPLAY}`, letterSpacing: '-0.02em', marginTop: 40 }}>{title}</div>
    <div style={{ font: `400 32px/1.4 ${UI}`, color: C.t2, marginTop: 16 }}>{text}</div>
  </Rise>
);

const Trust = () => (
  <Scene length={SCENES.trust}>
    <AbsoluteFill style={{ padding: '0 130px', justifyContent: 'center', gap: 70 }}>
      <div>
        <Rise delay={2} style={{ ...EYEBROW, color: C.red }}>Private by design</Rise>
        <Words text="Nothing between you and your account." delay={6} style={{ ...H1, fontSize: 92, marginTop: 18 }} />
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <Card delay={26} accent icon={CursorPointer01Icon} title="One-click login" text="You sign in on Spotify's own site." />
        <Card delay={34} icon={File01Icon} title="One small file" text="No installer. Nothing to set up." />
        <Card delay={42} icon={HardDriveIcon} title="No servers of ours" text="Your data stays on your PC." />
      </div>
    </AbsoluteFill>
  </Scene>
);

// ---------- 6. chamada ----------

const Cta = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.black, color: C.white, fontFamily: UI, alignItems: 'center', justifyContent: 'center' }}>
      <Rise delay={0}><Disc size={300} spin={frame * 1.2} /></Rise>
      <Words text="ALL MUSIC" delay={8} style={{ ...H1, fontSize: 132, marginTop: 44, justifyContent: 'center' }} />
      <Rise delay={20} style={{ font: `500 40px/1.3 ${UI}`, color: C.t2, marginTop: 10 }}>Free. No ads. For Windows.</Rise>
      <Rise delay={30} style={{ marginTop: 46, display: 'flex', alignItems: 'center', gap: 18, height: 96, padding: '0 44px', borderRadius: 999, background: C.white, color: C.black, font: `600 34px/1 ${UI}` }}>
        <Icon icon={Download04Icon} size={40} />Download for Windows
      </Rise>
      <Rise delay={44} style={{ position: 'absolute', bottom: 54, font: `400 22px/1.4 ${UI}`, color: C.t3, textAlign: 'center' }}>
        Independent project, not affiliated with Spotify or YouTube. Spotify playback requires Premium.
      </Rise>
    </AbsoluteFill>
  );
};

// ---------- montagem ----------

export const Promo = () => {
  let at = 0;
  const scenes = [[Hook, SCENES.hook], [TabScene, SCENES.tab], [Reveal, SCENES.reveal], [AppScene, SCENES.app], [Trust, SCENES.trust], [Cta, SCENES.cta]];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {scenes.map(([Component, length], i) => {
        const from = at;
        at += length;
        return <Sequence key={i} from={from} durationInFrames={length}><Component /></Sequence>;
      })}
    </AbsoluteFill>
  );
};
