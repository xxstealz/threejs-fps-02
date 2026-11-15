// The arsenal: five guns and three grenades. Each definition owns its numbers —
// damage, fire rate, spread, magazine, price — so the buy menu, the bots and the
// judge all read the same table. A weapon instance is one definition plus its
// magazine state and its view model.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 26, headMult: 4, pellets: 1, fireGap: 0.16, magSize: 12, reserve: 36,
    reloadTime: 1.4, spreadStill: 0.004, spreadMoving: 0.02, auto: false, range: 60,
  },
  smg: {
    id: 'smg', name: 'Vandal-9 SMG', kind: 'smg', price: 1500,
    damage: 26, headMult: 4, pellets: 1, fireGap: 0.075, magSize: 32, reserve: 96,
    reloadTime: 2.0, spreadStill: 0.006, spreadMoving: 0.03, auto: true, range: 55,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Rifle', kind: 'rifle', price: 2700,
    damage: 34, headMult: 4, pellets: 1, fireGap: 0.096, magSize: 30, reserve: 90,
    reloadTime: 1.9, spreadStill: 0.0022, spreadMoving: 0.028, auto: true, range: 80,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', kind: 'shotgun', price: 1200,
    damage: 12, headMult: 2, pellets: 8, fireGap: 0.85, magSize: 6, reserve: 24,
    reloadTime: 2.6, spreadStill: 0.02, spreadMoving: 0.04, auto: false, range: 26,
  },
  sniper: {
    id: 'sniper', name: 'Longbow .50', kind: 'sniper', price: 4750,
    damage: 100, headMult: 4, pellets: 1, fireGap: 1.2, magSize: 5, reserve: 15,
    reloadTime: 2.8, spreadStill: 0.0005, spreadMoving: 0.05, auto: false, range: 120, scoped: true,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, radius: 9, damage: 90, fuse: 1.25 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, radius: 4, duration: 12, fuse: 1.1 },
  flash: { id: 'flash', name: 'Flashbang', price: 200, radius: 26, duration: 2.5, fuse: 1.0 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_POINTS = 100;

// One view model per weapon kind, built from boxes: no model files, no network.
function buildViewModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.3 });
  const model = new THREE.Group();
  function part(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  if (kind === 'pistol') {
    part(new THREE.BoxGeometry(0.06, 0.09, 0.24), body, 0, 0, -0.1);
    part(new THREE.BoxGeometry(0.05, 0.12, 0.07), grip, 0, -0.08, 0.02);
    part(new THREE.BoxGeometry(0.02, 0.02, 0.05), accent, 0, 0.05, -0.2);
  } else if (kind === 'smg') {
    part(new THREE.BoxGeometry(0.08, 0.09, 0.34), body, 0, 0, -0.08);
    part(new THREE.BoxGeometry(0.04, 0.04, 0.24), grip, 0, 0.02, -0.32);
    part(new THREE.BoxGeometry(0.06, 0.1, 0.08), grip, 0, -0.08, 0.06);
    part(new THREE.BoxGeometry(0.05, 0.03, 0.12), accent, 0, 0.05, -0.2);
  } else if (kind === 'shotgun') {
    part(new THREE.BoxGeometry(0.09, 0.1, 0.4), body, 0, 0, -0.06);
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10), grip, 0, 0.03, -0.4).rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(0.07, 0.07, 0.2), grip, 0, -0.02, 0.26);
    part(new THREE.BoxGeometry(0.09, 0.03, 0.3), accent, 0, 0.06, -0.14);
  } else if (kind === 'sniper') {
    part(new THREE.BoxGeometry(0.07, 0.09, 0.5), body, 0, 0, -0.1);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10), grip, 0, 0.025, -0.5).rotation.x = Math.PI / 2;
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12), accent, 0, 0.08, -0.08).rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(0.06, 0.09, 0.18), grip, 0, -0.02, 0.28);
  } else {
    // rifle
    part(new THREE.BoxGeometry(0.09, 0.1, 0.42), body, 0, 0, -0.1);
    part(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip, 0, 0.025, -0.48);
    part(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip, 0, -0.02, 0.3);
    part(new THREE.BoxGeometry(0.02, 0.05, 0.1), accent, 0, 0.07, -0.24);
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createWeaponInstance(camera, def) {
  const model = buildViewModel(def.kind);
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    def, mag: def.magSize, reserve: def.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, model, flashMesh: flash, flashLight,
  };

  return {
    state,
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (state.def.reloadTime - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const need = state.def.magSize - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.fireGap;
      state.flash = 0.06;
      state.kick = state.def.kind === 'sniper' ? 0.12 : state.def.kind === 'shotgun' ? 0.09 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.magSize || state.reserve === 0) return false;
      state.reloadLeft = state.def.reloadTime;
      return true;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.2);
      return state.def.spreadStill + moving * state.def.spreadMoving;
    },
    refill() {
      state.mag = state.def.magSize;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    dispose() {
      camera.remove(model, flash, flashLight);
    },
  };
}
