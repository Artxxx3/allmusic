//! Efeitos de áudio aplicados às amostras antes de chegarem à placa de som.
//!
//! O librespot entrega o áudio decodificado (estéreo intercalado, 44,1 kHz) a um `Sink`.
//! `FxSink` embrulha a saída real e transforma as amostras no caminho, conforme o efeito
//! e os ajustes escolhidos no app. (As faixas do YouTube recebem o mesmo tratamento em
//! ui/js/yt-fx.js; mudou aqui, mude lá.)

use std::{
    f64::consts::{FRAC_1_SQRT_2, PI},
    sync::{Arc, Mutex},
};

use librespot_playback::{
    audio_backend::{Sink, SinkResult},
    convert::Converter,
    decoder::AudioPacket,
    SAMPLE_RATE,
};

pub const OFF: u8 = 0;
pub const MUFFLED: u8 = 1;
pub const EIGHT_D: u8 = 2;

pub fn by_name(name: &str) -> u8 {
    match name {
        "muffled" => MUFFLED,
        "8d" => EIGHT_D,
        _ => OFF,
    }
}

/// Efeito ativo e seus ajustes; o app pode mudar qualquer um deles com a música tocando.
#[derive(Clone, Copy, PartialEq)]
pub struct Config {
    pub effect: u8,
    /// Abafado: frequência de corte dos agudos (Hz). Quanto menor, mais abafado.
    pub cutoff: f64,
    /// Abafado: ressonância no corte (0,707 = nenhuma; valores maiores soam "debaixo d'água").
    pub q: f64,
    /// Abafado: corte mais íngreme (dois filtros em série).
    pub steep: bool,
    /// Abafado: corte dos graves (Hz), para a batida não encobrir a voz. Abaixo de 15 fica desligado.
    pub hp: f64,
    /// Abafado: ganho que compensa o volume perdido.
    pub gain: f64,
    /// 8D: segundos para o som dar uma volta.
    pub turn: f64,
    /// 8D: o quanto o som se afasta do centro (0 a 1).
    pub depth: f64,
    /// 8D: quantidade de eco (0 a 1).
    pub echo: f64,
    /// 8D: em vez de girar, o som salta de um lado para o outro.
    pub hop: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self { effect: OFF, cutoff: 600.0, q: FRAC_1_SQRT_2, steep: true, hp: 100.0, gain: 1.6, turn: 9.0, depth: 1.0, echo: 0.5, hop: false }
    }
}

pub type Shared = Arc<Mutex<Config>>;

/// Filtro de segunda ordem (fórmulas do "Audio EQ Cookbook" de R. Bristow-Johnson).
#[derive(Clone, Copy, Default)]
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
    x: [f64; 2],
    y: [f64; 2],
}

impl Biquad {
    fn low_pass(cutoff_hz: f64) -> Self {
        let mut filter = Self::default();
        filter.tune(cutoff_hz, FRAC_1_SQRT_2, false);
        filter
    }

    /// Muda o corte sem zerar o estado (não estala ao arrastar o ajuste).
    fn tune(&mut self, cutoff_hz: f64, q: f64, high_pass: bool) {
        let w0 = 2.0 * PI * cutoff_hz / f64::from(SAMPLE_RATE);
        let alpha = w0.sin() / (2.0 * q);
        let a0 = 1.0 + alpha;
        self.b = if high_pass {
            let b1 = (1.0 + w0.cos()) / a0;
            [b1 / 2.0, -b1, b1 / 2.0]
        } else {
            let b1 = (1.0 - w0.cos()) / a0;
            [b1 / 2.0, b1, b1 / 2.0]
        };
        self.a = [-2.0 * w0.cos() / a0, (1.0 - alpha) / a0];
    }

    fn reset(&mut self) {
        self.x = [0.0; 2];
        self.y = [0.0; 2];
    }

    fn run(&mut self, input: f64) -> f64 {
        let out = self.b[0] * input + self.b[1] * self.x[0] + self.b[2] * self.x[1] - self.a[0] * self.y[0] - self.a[1] * self.y[1];
        self.x = [input, self.x[0]];
        self.y = [out, self.y[0]];
        out
    }
}

/// Eco curto realimentado: dá a sensação de sala ao efeito 8D.
struct Echo {
    buffer: Vec<f64>,
    at: usize,
}

impl Echo {
    fn new(millis: f64) -> Self {
        Self { buffer: vec![0.0; (f64::from(SAMPLE_RATE) * millis / 1000.0) as usize], at: 0 }
    }

    fn run(&mut self, input: f64) -> f64 {
        let delayed = self.buffer[self.at];
        self.buffer[self.at] = input + delayed * 0.38;
        self.at = (self.at + 1) % self.buffer.len();
        delayed
    }
}

/// Limitador: quando o pico passa do teto, abaixa o volume dos dois canais juntos e o devolve aos
/// poucos. Cortar as amostras no teto distorceria (chiado); isto só reduz o ganho.
#[derive(Default)]
struct Limiter {
    envelope: f64,
}

impl Limiter {
    const CEILING: f64 = 0.9;
    const RELEASE: f64 = 0.9997; // volta ao normal em cerca de 0,1 s

    fn run(&mut self, frame: &mut [f64]) {
        let peak = frame.iter().fold(0.0_f64, |max, sample| max.max(sample.abs()));
        self.envelope = peak.max(self.envelope * Self::RELEASE);
        if self.envelope > Self::CEILING {
            let scale = Self::CEILING / self.envelope;
            frame.iter_mut().for_each(|sample| *sample *= scale);
        }
    }
}

pub struct FxSink {
    inner: Box<dyn Sink>,
    shared: Shared,
    config: Config,
    limiter: Limiter,
    // abafado, por canal: corta-graves e dois corta-agudos em série
    bass_cut: [Biquad; 2],
    muffle: [[Biquad; 2]; 2],
    // 8D: o som gira em volta da cabeça
    phase: f64,
    shadow: [Biquad; 2],
    echo: [Echo; 2],
}

impl FxSink {
    pub fn new(inner: Box<dyn Sink>, shared: Shared) -> Self {
        let mut sink = Self {
            inner,
            shared,
            config: Config::default(),
            limiter: Limiter::default(),
            bass_cut: [Biquad::default(); 2],
            muffle: [[Biquad::default(); 2]; 2],
            phase: 0.0,
            shadow: [Biquad::low_pass(2600.0); 2],
            echo: [Echo::new(47.0), Echo::new(61.0)],
        };
        sink.tune();
        sink
    }

    fn tune(&mut self) {
        let Config { cutoff, q, hp, .. } = self.config;
        self.bass_cut.iter_mut().for_each(|filter| filter.tune(hp.max(15.0), FRAC_1_SQRT_2, true));
        for channel in &mut self.muffle {
            channel[0].tune(cutoff, q, false);
            channel[1].tune(cutoff, FRAC_1_SQRT_2, false);
        }
    }

    fn process(&mut self, samples: &mut [f64]) {
        let wanted = *self.shared.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if wanted != self.config {
            if wanted.effect != self.config.effect || wanted.steep != self.config.steep {
                // troca de efeito: zera o estado dos filtros para não carregar resto do anterior
                self.muffle.iter_mut().flatten().chain(&mut self.shadow).chain(&mut self.bass_cut).for_each(Biquad::reset);
            }
            self.config = wanted;
            self.tune();
        }
        let Config { effect, steep, hp, gain, turn, depth, echo, hop, .. } = self.config;
        match effect {
            MUFFLED => {
                for frame in samples.chunks_exact_mut(2) {
                    for (ch, sample) in frame.iter_mut().enumerate() {
                        let mut out = *sample;
                        if hp >= 15.0 {
                            out = self.bass_cut[ch].run(out);
                        }
                        out = self.muffle[ch][0].run(out);
                        if steep {
                            out = self.muffle[ch][1].run(out);
                        }
                        *sample = out * gain;
                    }
                    self.limiter.run(frame);
                }
            }
            EIGHT_D => {
                let step = 2.0 * PI / (turn * f64::from(SAMPLE_RATE));
                for frame in samples.chunks_exact_mut(2) {
                    self.phase = (self.phase + step) % (2.0 * PI);
                    let mut swing = self.phase.sin();
                    if hop {
                        // fica quase parado num lado e atravessa rápido para o outro
                        swing = (swing * 4.0).tanh() / 4.0_f64.tanh();
                    }
                    let pan = swing * depth;                    // -1 (esquerda) … 1 (direita)
                    let angle = (pan + 1.0) * PI / 4.0;         // panorama de potência constante
                    let level = [angle.cos(), angle.sin()];
                    let mid = (frame[0] + frame[1]) * 0.5;
                    for ch in 0..2 {
                        let dry = (mid * 0.8 + frame[ch] * 0.2) * level[ch] * 1.3;
                        // o ouvido oposto à fonte ouve menos agudos (sombra da cabeça)
                        let far = 1.0 - level[ch];
                        let shaded = self.shadow[ch].run(dry);
                        let direct = dry * (1.0 - far * 0.7) + shaded * far * 0.7;
                        let wet = self.echo[ch].run(direct);
                        frame[ch] = direct * (1.0 - echo * 0.28) + wet * echo * 0.4;
                    }
                    self.limiter.run(frame);
                }
            }
            _ => {}
        }
    }
}

impl Sink for FxSink {
    fn start(&mut self) -> SinkResult<()> {
        self.inner.start()
    }

    fn stop(&mut self) -> SinkResult<()> {
        self.inner.stop()
    }

    fn write(&mut self, packet: AudioPacket, converter: &mut Converter) -> SinkResult<()> {
        match packet {
            AudioPacket::Samples(mut samples) => {
                self.process(&mut samples);
                self.inner.write(AudioPacket::Samples(samples), converter)
            }
            other => self.inner.write(other, converter),
        }
    }
}
