function createNoiseBuffer(context) {
  const duration = 1;
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.muted = false;
    this.volume = 0.85;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.master.connect(this.context.destination);
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.musicGain.gain.value = 0.33;
      this.sfxGain.gain.value = 0.5;
      this.noiseBuffer = createNoiseBuffer(this.context);
    }

    if (this.context.state !== 'running') {
      await this.context.resume();
    }

    this.unlocked = true;
    this.applyVolume();
    if (!this.musicTimer) this.startMusic();
  }

  applyVolume() {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }

  setMuted(value) {
    this.muted = value;
    this.applyVolume();
  }

  startMusic() {
    if (!this.context || this.musicTimer) return;

    const sequence = [
      [220, 277, 330],
      [196, 247, 294],
      [174, 220, 262],
      [196, 247, 311],
      [220, 277, 349],
      [262, 330, 392],
      [247, 311, 370],
      [220, 277, 330]
    ];

    this.musicTimer = setInterval(() => {
      if (!this.context || !this.musicGain) return;
      const now = this.context.currentTime;
      const chord = sequence[this.musicStep % sequence.length];
      this.musicStep += 1;

      chord.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = index === 0 ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.33);
      });

      const bass = this.context.createOscillator();
      const bassGain = this.context.createGain();
      bass.type = 'square';
      bass.frequency.setValueAtTime(chord[0] / 2, now);
      bassGain.gain.setValueAtTime(0.0001, now);
      bassGain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      bass.connect(bassGain);
      bassGain.connect(this.musicGain);
      bass.start(now);
      bass.stop(now + 0.37);
    }, 360);
  }

  stopMusic() {
    if (!this.musicTimer) return;
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  playShovel() {
    if (!this.unlocked || !this.context) return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);

    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const noiseFilter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.12);
  }

  playPlowRush() {
    if (!this.unlocked || !this.context) return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(45, now + 0.6);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  playCombo() {
    if (!this.unlocked || !this.context) return;
    const now = this.context.currentTime;
    const notes = [660, 880, 990];
    notes.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = now + i * 0.05;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.14);
    });
  }

  playCrash() {
    if (!this.unlocked || !this.context) return;
    const now = this.context.currentTime;
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 220;
    filter.Q.value = 0.9;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.35);
  }
}
