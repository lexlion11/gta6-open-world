// WebAudio sound: everything is synthesized at runtime with oscillators and noise
// buffers — engine hum that tracks speed, two-tone siren, gunshots, punches, hits,
// explosions, tire screech, pickup blips and a soft city ambience. No audio files.
import { DAY_MINUTES } from './config.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.screechSource = null;
    this.noiseBuffer = null;
    this.ambienceStarted = false;
  }

  /** Audio must be created after a user gesture; call this from the start screen. */
  start() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(1.0);
    } catch {
      this.ctx = null;
      this.enabled = false;
    }
  }

  setMuted(muted) {
    this.enabled = !muted;
    if (this.master && this.ctx) this.master.gain.value = muted ? 0 : 0.6;
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseBurst(duration, freq, gain, type = 'lowpass', sweep = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  tone(duration, freq, gain, shape = 'sine', glide = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  gunshot() {
    this.noiseBurst(0.09, 1600, 0.5, 'lowpass', 0.25);
    this.tone(0.06, 120, 0.35, 'square', 50);
  }

  policeShot() {
    this.noiseBurst(0.07, 1200, 0.28, 'lowpass', 0.3);
  }

  punch() {
    this.tone(0.12, 90, 0.4, 'sine', 40);
    this.noiseBurst(0.05, 500, 0.12, 'lowpass');
  }

  hit() {
    this.noiseBurst(0.06, 900, 0.2, 'lowpass', 0.4);
  }

  explosion() {
    this.noiseBurst(0.5, 700, 0.6, 'lowpass', 0.12);
    this.tone(0.4, 70, 0.5, 'sine', 28);
  }

  pickup() {
    this.tone(0.08, 660, 0.3, 'square');
    this.tone(0.1, 990, 0.25, 'square');
  }

  missionDone() {
    this.tone(0.12, 523, 0.3, 'square');
    this.tone(0.12, 659, 0.3, 'square');
    this.tone(0.18, 784, 0.3, 'square');
  }

  crash(intensity) {
    this.noiseBurst(0.12 + intensity * 0.1, 500, Math.min(0.5, 0.15 + intensity * 0.3), 'lowpass', 0.4);
  }

  /** Start the engine loop; call when the player gets into a car. */
  engineStart() {
    if (!this.ctx || !this.enabled || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.05;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  engineStop() {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch { /* already stopped */ }
      this.engineOsc.disconnect();
      this.engineGain.disconnect();
      this.engineOsc = null;
      this.engineGain = null;
    }
  }

  /** speed01: 0 idling .. 1 top speed. */
  engineUpdate(speed01) {
    if (this.engineOsc && this.ctx) {
      this.engineOsc.frequency.setTargetAtTime(58 + speed01 * 190, this.ctx.currentTime, 0.08);
    }
  }

  /** Siren while police are actively hunting. */
  sirenStart() {
    if (!this.ctx || !this.enabled || this.sirenOsc) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.06;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenTimer = 0;
  }

  sirenStop() {
    if (this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenGain.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  sirenUpdate(dt) {
    if (!this.sirenOsc || !this.ctx) return;
    this.sirenTimer = (this.sirenTimer ?? 0) + dt;
    const phase = Math.floor(this.sirenTimer / 0.45) % 2;
    const target = phase === 0 ? 720 : 920;
    this.sirenOsc.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  /** Brief screech for hard cornering. */
  screech() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2600;
    filter.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.2);
  }
}
