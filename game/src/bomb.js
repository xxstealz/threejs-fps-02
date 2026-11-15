// The bomb: carried, planted, ticking, exploded or defused. One small state machine
// — the round only ends on its transitions, never on a guess.
export function createBomb() {
  const state = {
    state: 'carried', // carried | planted | exploded | defused | gone
    carrier: null, // bot or 'player'
    targetSite: 'A',
    position: null, // Vector3 once planted
    plantedAt: 0,
    timer: 40,
    beepAt: 0,
  };

  return {
    state,
    reset(carrier, targetSite) {
      state.state = 'carried';
      state.carrier = carrier;
      state.targetSite = targetSite;
      state.position = null;
      state.plantedAt = 0;
      state.timer = 40;
      state.beepAt = 0;
    },
    plant(position, now) {
      state.state = 'planted';
      state.position = position.clone();
      state.plantedAt = now;
      state.timer = 40;
      state.beepAt = now;
    },
    step(now) {
      if (state.state !== 'planted') return null;
      const remaining = 40 - (now - state.plantedAt);
      state.timer = Math.max(0, remaining);
      const interval = remaining < 10 ? 0.4 : remaining < 20 ? 0.7 : 1;
      if (now >= state.beepAt) {
        state.beepAt = now + interval;
        return { beep: true, fast: remaining < 10 };
      }
      return { beep: false };
    },
    explode() {
      state.state = 'exploded';
    },
    defuse() {
      state.state = 'defused';
    },
    clear() {
      state.state = 'gone';
    },
  };
}
