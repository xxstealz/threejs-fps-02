// Procedural sound, WebAudio only: no audio files, no network. Every effect is a
// short burst of filtered noise or an oscillator, made once and reused. Volume falls
// with distance for anything the player hears from elsewhere.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, type = 'lowpass', frequency = 1200, gain = 0.5, at = 0, decay = null }) {
    if (!ensure() || muted) return;
    const t = context.currentTime + at;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + (decay ?? duration));
    source.connect(filter).connect(amp).connect(master);
    source.start(t, 0, duration + 0.05);
    source.stop(t + duration + 0.05);
  }

  function tone({ frequency, duration, type = 'square', gain = 0.2, at = 0, slideTo = null }) {
    if (!ensure() || muted) return;
    const t = context.currentTime + at;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // distance in metres: 0 at the player's ear, quiet past ~40 m.
  function distanceGain(distance) {
    return Math.max(0.04, 1 - distance / 42);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shoot(kind, distance = 0) {
      const g = distance === 0 ? 0.5 : 0.5 * distanceGain(distance);
      if (kind === 'sniper') {
        burst({ duration: 0.32, frequency: 700, gain: g * 1.2 });
        tone({ frequency: 160, duration: 0.18, type: 'sawtooth', gain: g * 0.4, slideTo: 55 });
      } else if (kind === 'shotgun') {
        burst({ duration: 0.22, frequency: 500, gain: g * 1.1 });
      } else if (kind === 'smg') {
        burst({ duration: 0.09, frequency: 1600, gain: g * 0.7 });
      } else if (kind === 'pistol') {
        burst({ duration: 0.11, frequency: 1100, gain: g * 0.8 });
      } else {
        burst({ duration: 0.14, frequency: 900, gain: g });
        tone({ frequency: 220, duration: 0.08, type: 'sawtooth', gain: g * 0.25, slideTo: 90 });
      }
    },
    dryFire() {
      tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.12 });
    },
    reload() {
      tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.12 });
      tone({ frequency: 600, duration: 0.04, type: 'square', gain: 0.12, at: 0.18 });
      tone({ frequency: 1100, duration: 0.05, type: 'square', gain: 0.14, at: 0.42 });
    },
    hit(killed) {
      tone({ frequency: killed ? 1560 : 1180, duration: 0.06, type: 'sine', gain: 0.25 });
      if (killed) tone({ frequency: 2090, duration: 0.09, type: 'sine', gain: 0.2, at: 0.06 });
    },
    hurt() {
      burst({ duration: 0.12, frequency: 300, gain: 0.3 });
    },
    step(distance = 0) {
      burst({ duration: 0.05, frequency: 420, gain: 0.1 * distanceGain(distance) });
    },
    beep() {
      tone({ frequency: 1040, duration: 0.09, type: 'sine', gain: 0.22 });
    },
    plantBeep(fast) {
      tone({ frequency: fast ? 1560 : 1040, duration: 0.07, type: 'sine', gain: 0.2 });
    },
    explosion(distance = 0) {
      const g = distance === 0 ? 1 : distanceGain(distance);
      burst({ duration: 1.1, frequency: 260, gain: 0.9 * g, decay: 1.1 });
      tone({ frequency: 90, duration: 0.7, type: 'sine', gain: 0.6 * g, slideTo: 32 });
    },
    grenadePin() {
      tone({ frequency: 1900, duration: 0.03, type: 'square', gain: 0.1 });
    },
    roundWin() {
      tone({ frequency: 523, duration: 0.14, type: 'triangle', gain: 0.22 });
      tone({ frequency: 659, duration: 0.14, type: 'triangle', gain: 0.22, at: 0.13 });
      tone({ frequency: 784, duration: 0.22, type: 'triangle', gain: 0.22, at: 0.26 });
    },
    roundLose() {
      tone({ frequency: 392, duration: 0.16, type: 'triangle', gain: 0.2 });
      tone({ frequency: 311, duration: 0.24, type: 'triangle', gain: 0.2, at: 0.15 });
    },
    buy() {
      tone({ frequency: 880, duration: 0.05, type: 'sine', gain: 0.16 });
      tone({ frequency: 1320, duration: 0.06, type: 'sine', gain: 0.14, at: 0.05 });
    },
  };
}
