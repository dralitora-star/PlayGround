export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem('skullfall.muted') === '1';
    this.noiseBuffer = null;
    this.wind = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2.5);
    this.startWind();
  }

  makeNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.96 + white * 0.04;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  startWind() {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 360;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.055;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    lfo.start();
    this.wind = { src, gain };
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('skullfall.muted', muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  tone(freq, endFreq, dur, type = 'sine', gain = 0.15, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise(dur, gain, type = 'bandpass', f0 = 1200, f1 = 400, delay = 0, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  click() {
    this.tone(460, 320, 0.08, 'triangle', 0.12);
    this.noise(0.06, 0.05, 'highpass', 2000, 1000);
  }

  swing(step = 0) {
    const base = 1300 + step * 250;
    this.noise(0.22, 0.16, 'bandpass', base, 380, 0, 1.6);
    this.tone(280 - step * 30, 140, 0.14, 'triangle', 0.075);
  }

  hit(crit = false) {
    this.tone(crit ? 180 : 140, 52, crit ? 0.2 : 0.12, 'sine', crit ? 0.3 : 0.2);
    this.noise(crit ? 0.16 : 0.1, crit ? 0.22 : 0.15, 'lowpass', 1700, 300, 0, 0.8);
    if (crit) {
      this.tone(880, 660, 0.18, 'triangle', 0.1, 0.01);
      this.noise(0.14, 0.1, 'highpass', 2600, 900, 0.01);
    }
  }

  enemyDie(big = false) {
    this.tone(big ? 220 : 260, 54, 0.42, 'triangle', big ? 0.22 : 0.14);
    this.noise(0.35, 0.12, 'lowpass', 1300, 180);
    this.tone(big ? 90 : 120, 40, 0.5, 'sawtooth', 0.05, 0.02);
    for (let i = 0; i < 3; i++) {
      this.tone(700 + i * 180, 500 + i * 120, 0.09, 'square', 0.025, 0.06 + i * 0.045);
    }
  }

  hurt() {
    this.tone(190, 70, 0.24, 'sawtooth', 0.16);
    this.noise(0.2, 0.14, 'lowpass', 900, 180);
  }

  levelUp() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => {
      this.tone(n, n * 1.005, 0.5, 'triangle', 0.12, i * 0.095);
      this.tone(n / 2, n / 2, 0.55, 'sine', 0.06, i * 0.095);
    });
    this.noise(0.6, 0.045, 'highpass', 5000, 2000, 0.1);
  }

  death() {
    this.tone(180, 42, 1.1, 'sawtooth', 0.16);
    this.tone(128, 32, 1.4, 'sine', 0.18, 0.1);
    this.noise(1.2, 0.1, 'lowpass', 900, 100, 0.05);
  }

  respawn() {
    const notes = [392, 523, 659, 784];
    notes.forEach((n, i) => this.tone(n, n, 0.35, 'sine', 0.09, i * 0.08));
    this.noise(0.7, 0.06, 'highpass', 1200, 3000, 0.1);
  }

  skill() {
    this.noise(0.5, 0.2, 'bandpass', 500, 3200, 0, 2.2);
    this.tone(220, 880, 0.4, 'triangle', 0.1);
    this.tone(330, 1320, 0.45, 'sine', 0.07, 0.04);
    this.noise(0.4, 0.12, 'highpass', 4000, 1200, 0.16);
  }

  cast() {
    this.tone(280, 760, 0.3, 'sine', 0.06);
    this.noise(0.26, 0.05, 'bandpass', 900, 2400, 0, 2.5);
  }

  impact() {
    this.tone(120, 46, 0.18, 'sine', 0.16);
    this.noise(0.22, 0.13, 'lowpass', 1600, 240);
  }

  noMana() {
    this.tone(180, 120, 0.09, 'square', 0.06);
    this.tone(150, 100, 0.12, 'square', 0.05, 0.09);
  }

  zone() {
    this.tone(330, 440, 0.4, 'sine', 0.05);
    this.tone(495, 660, 0.5, 'sine', 0.04, 0.08);
  }

  deny() {
    this.tone(140, 100, 0.1, 'square', 0.05);
  }
}
