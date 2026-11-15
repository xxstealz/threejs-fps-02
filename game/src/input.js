// Input: keyboard, mouse look, pointer lock, wheel weapon cycling, and a small
// queue of discrete actions (buy keys, throw, reload) the game loop drains once a
// frame, so a key press is never lost between frames.
export function createInput(canvas) {
  const keys = new Set();
  const actions = [];
  let lookDX = 0;
  let lookDY = 0;
  let firing = false;
  let rightMouse = false;
  let locked = false;
  let wheelDelta = 0;

  function lock() {
    if (!locked) canvas.requestPointerLock();
  }

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => {
    if (!locked) lock();
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    lookDX += event.movementX;
    lookDY += event.movementY;
  });
  document.addEventListener('mousedown', (event) => {
    if (!locked) return;
    if (event.button === 0) firing = true;
    if (event.button === 2) rightMouse = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
    if (event.button === 2) rightMouse = false;
  });
  document.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('wheel', (event) => {
    if (locked) wheelDelta += Math.sign(event.deltaY);
  }, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    actions.push(event.code);
  });
  document.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
    rightMouse = false;
  });

  return {
    keys,
    lock,
    get locked() { return locked; },
    get firing() { return firing; },
    get rightMouse() { return rightMouse; },
    consumeLook() {
      const dx = lookDX;
      const dy = lookDY;
      lookDX = 0;
      lookDY = 0;
      return { dx, dy };
    },
    consumeWheel() {
      const delta = wheelDelta;
      wheelDelta = 0;
      return delta;
    },
    drainActions() {
      const drained = actions.splice(0, actions.length);
      return drained;
    },
  };
}
