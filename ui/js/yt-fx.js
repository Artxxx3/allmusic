// Efeitos de áudio nas faixas do YouTube.
//
// A página do app não alcança o áudio do player, que fica num iframe de outro domínio. Por isso o
// app hospedeiro injeta este arquivo em todos os frames (WebView2), e ele só age dentro do iframe
// do player: liga o <video> a um grafo de Web Audio e recebe da página do app, por postMessage,
// o efeito e os ajustes: os mesmos valores enviados ao motor do Spotify (engine/src/fx.rs).
(() => {
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname) || !location.pathname.startsWith('/embed/')) return;
  const APP_ORIGIN = 'http://127.0.0.1:38417';

  let config = { name: '' };
  let audio = null; // grafo criado só quando um efeito é ligado pela primeira vez
  let waiting = 0;

  // curva do "pingue-pongue": o som fica quase parado num lado e atravessa rápido para o outro
  const HOP = Float32Array.from({ length: 257 }, (_, i) => Math.tanh((i / 128 - 1) * 4) / Math.tanh(4));

  function build(video) {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(video);
    // limitador na saída dos efeitos: segura os picos sem distorcer
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);

    // abafado: corta-graves, um ou dois corta-agudos em série e ganho para compensar
    const bassCut = ctx.createBiquadFilter();
    bassCut.type = 'highpass';
    const low = [ctx.createBiquadFilter(), ctx.createBiquadFilter()];
    low.forEach(filter => { filter.type = 'lowpass'; });
    const boost = ctx.createGain();
    bassCut.connect(low[0]);
    low[1].connect(boost);
    boost.connect(limiter);

    // 8D: um oscilador lento move o som entre os lados; um eco curto dá a sensação de sala
    const panner = ctx.createStereoPanner();
    const turn = ctx.createOscillator();
    const shape = ctx.createWaveShaper();
    const depth = ctx.createGain();
    turn.connect(shape).connect(depth).connect(panner.pan);
    turn.start();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const delay = ctx.createDelay(0.2);
    const feedback = ctx.createGain();
    delay.delayTime.value = 0.054;
    feedback.gain.value = 0.38;
    panner.connect(dry).connect(limiter);
    panner.connect(delay).connect(wet).connect(limiter);
    delay.connect(feedback).connect(delay);

    video.addEventListener('playing', () => { if (ctx.state !== 'running') ctx.resume(); });
    return { ctx, source, bassCut, low, boost, panner, turn, shape, depth, dry, wet };
  }

  function apply() {
    if (!audio) {
      if (!config.name) return; // sem efeito e sem grafo: o player segue intocado
      const video = document.querySelector('video');
      if (!video) {
        clearTimeout(waiting);
        waiting = setTimeout(apply, 500);
        return;
      }
      audio = build(video);
    }
    const { ctx, source, bassCut, low, boost, panner, turn, shape, depth, dry, wet } = audio;
    if (ctx.state !== 'running') ctx.resume();
    const set = (param, value) => param.setTargetAtTime(value, ctx.currentTime, 0.03);
    // o Q do Web Audio é em dB nos filtros passa-baixa/alta: 0 dB equivale a 0,707 (sem ressonância)
    const decibels = q => 20 * Math.log10((q || Math.SQRT1_2) / Math.SQRT1_2);
    set(bassCut.frequency, Math.max(15, config.hp || 0));
    bassCut.Q.value = 0;
    low.forEach(filter => set(filter.frequency, config.cutoff || 600));
    low[0].Q.value = decibels(config.q);
    low[1].Q.value = 0;
    set(boost.gain, config.gain || 1);
    set(turn.frequency, 1 / (config.turn || 9));
    shape.curve = config.hop ? HOP : null;
    set(depth.gain, config.depth ?? 1);
    set(dry.gain, 1 - (config.echo ?? 0.5) * 0.28);
    set(wet.gain, (config.echo ?? 0.5) * 0.4);

    low[0].disconnect();
    low[0].connect(config.steep ? low[1] : boost);
    source.disconnect();
    source.connect(config.name === 'muffled' ? bassCut : config.name === '8d' ? panner : ctx.destination);
    document.documentElement.dataset.allmusicFx = `${config.name || 'off'} ${ctx.state}`; // para conferir em testes
  }

  addEventListener('message', e => {
    if (e.origin !== APP_ORIGIN || !e.data?.allmusicFx) return;
    config = e.data.allmusicFx;
    apply();
  });
})();
