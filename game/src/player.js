// Movement, shared by the player and the bots: acceleration, friction, gravity,
// crouch and jump, resolved as a box against the world's colliders one axis at a
// time, so a wall never swallows a body. One mover per body, no allocations in step.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createMover(colliders, x, z) {
  const state = {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(px, py, pz, height, lift) {
    probe.min.set(px - RADIUS, py + lift, pz - RADIUS);
    probe.max.set(px + RADIUS, py + height - lift, pz + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  // wishX/wishZ is a unit wish direction in world space (or 0,0 to stop); speed is the
  // target speed; jump is true on the frame the body wants to jump.
  function step(dt, wishX, wishZ, speed, wantCrouch, jump) {
    if (wantCrouch && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && state.crouching && !overlaps(state.position.x, state.position.y, state.position.z, STAND_HEIGHT, 0.02)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    state.velocity.x += (wishX * speed - state.velocity.x) * blend;
    state.velocity.z += (wishZ * speed - state.velocity.z) * blend;
    if (state.onGround && wishX === 0 && wishZ === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }

    if (jump && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;

    const nextX = state.position.x + state.velocity.x * dt;
    if (!overlaps(nextX, state.position.y, state.position.z, state.height, 0.04)) state.position.x = nextX;
    else state.velocity.x = 0;
    const nextZ = state.position.z + state.velocity.z * dt;
    if (!overlaps(state.position.x, state.position.y, nextZ, state.height, 0.04)) state.position.z = nextZ;
    else state.velocity.z = 0;

    state.position.y += state.velocity.y * dt;
    state.onGround = false;
    const hit = overlaps(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (hit && state.velocity.y <= 0) {
      state.position.y = hit.max.y;
      state.velocity.y = 0;
      state.onGround = true;
    } else if (hit) {
      state.position.y = hit.min.y - state.height;
      state.velocity.y = 0;
    }
    if (state.position.y < 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
    state.velocity.y = Math.max(-30, state.velocity.y);
  }

  return {
    state,
    step,
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    walkSpeed(crouching) {
      return crouching ? CROUCH_SPEED : WALK_SPEED;
    },
  };
}

export function createPlayer(colliders) {
  const mover = createMover(colliders, 0, 18.5);
  const body = mover.state;
  body.health = 100;
  body.armor = 0;
  body.alive = true;

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      const len = Math.hypot(wishX, wishZ) || 1;
      wishX /= len;
      wishZ /= len;
    }
    mover.step(dt, wishX, wishZ, mover.walkSpeed(crouching), crouching, keys.has('Space'));
  }

  return {
    state: body,
    step,
    look,
    recoil,
    groundSpeed: mover.groundSpeed,
  };
}
