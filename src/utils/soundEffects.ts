let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playCountdownBeep(isFinalSecond = false, muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinalSecond ? 1046.5 : 659.25, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isFinalSecond ? 0.22 : 0.12));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (isFinalSecond ? 0.24 : 0.14));
  } catch {
    // Ignore audio errors on blocked autoplay
  }
}

export function playShutterSound(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    // Synthesize crisp mechanical shutter click using brief filtered noise + click transient
    const duration = 0.11;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const envelope = Math.exp((-i / bufferSize) * 14);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, ctx.currentTime);
    filter.Q.setValueAtTime(1.2, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(ctx.currentTime);
  } catch {
    // Ignore audio errors
  }
}
