// Grenades: a thrown projectile with gravity and a bounce, then a payload.
// Frag hurts by distance and line of sight. Smoke makes a cloud that blocks bot
// vision and the player's view. Flash blinds anything looking at the pop. All three
// are thrown by the player and by bots, through the same code.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const BOUNCE = 0.42;
const _point = new THREE.Vector3();
const _to = new THREE.Vector3();

export function createGrenades(scene, world, combat, random) {
  const projectiles = [];
  const clouds = [];
  const pool = [];
  for (let i = 0; i < 6; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.4 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    pool.push(mesh);
  }

  function throwGrenade(origin, direction, type, def, thrower) {
    const mesh = pool.find((m) => !m.visible);
    if (!mesh) return false;
    mesh.visible = true;
    mesh.position.copy(origin);
    projectiles.push({
      mesh, type, def, thrower,
      velocity: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: def.fuse, bounced: 0,
    });
    return true;
  }

  function step(dt, now, entities, onDetonate) {
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      p.velocity.y -= GRAVITY * dt;
      const prev = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.velocity, dt);
      const pos = p.mesh.position;
      if (pos.y < 0.09) {
        pos.y = 0.09;
        p.velocity.y = Math.abs(p.velocity.y) * BOUNCE;
        p.velocity.x *= 0.8;
        p.velocity.z *= 0.8;
      }
      for (const collider of world.colliders) {
        if (collider.containsPoint(pos)) {
          // Step back out along the axis the grenade moved furthest on.
          const dx = Math.abs(pos.x - prev.x);
          const dz = Math.abs(pos.z - prev.z);
          if (dx >= dz) {
            pos.x = prev.x;
            p.velocity.x = -p.velocity.x * BOUNCE;
          } else {
            pos.z = prev.z;
            p.velocity.z = -p.velocity.z * BOUNCE;
          }
          p.velocity.y *= 0.8;
          p.bounced += 1;
        }
      }
      p.fuse -= dt;
      if (p.fuse <= 0) {
        detonate(p, now, entities, onDetonate);
        p.mesh.visible = false;
        projectiles.splice(i, 1);
      }
    }
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      if (now > clouds[i].until) {
        clouds[i].group.visible = false;
        clouds.splice(i, 1);
      }
    }
  }

  function detonate(p, now, entities, onDetonate) {
    const center = p.mesh.position.clone();
    if (p.type === 'frag') {
      const killed = [];
      for (const entity of entities) {
        if (!entity.alive || entity === p.thrower || entity.team === p.thrower.team) continue;
        _to.copy(entity.chest).sub(center);
        const distance = _to.length();
        if (distance > p.def.radius) continue;
        const chest = entity.chest;
        _point.copy(center).add(new THREE.Vector3(0, 0.4, 0));
        if (!combat.lineOfSight(_point, chest)) continue;
        const damage = p.def.damage * (1 - distance / (p.def.radius * 1.4));
        let remaining = damage;
        if (entity.armor > 0) {
          const absorbed = Math.min(entity.armor, damage * 0.5);
          entity.armor -= absorbed;
          remaining -= absorbed;
        }
        entity.health -= remaining;
        if (entity.health <= 0) {
          entity.health = 0;
          killed.push(entity);
        }
      }
      onDetonate({ type: 'frag', center, def: p.def, thrower: p.thrower, killed });
    } else if (p.type === 'smoke') {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#b8b0a2'), transparent: true, opacity: 0.32, roughness: 1, depthWrite: false,
      });
      for (let i = 0; i < 9; i += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1.6 + (i % 3) * 0.5, 10, 8), mat);
        puff.position.set((random() - 0.5) * 4, 0.8 + (i % 3) * 0.7, (random() - 0.5) * 4);
        group.add(puff);
      }
      group.position.copy(center).setY(0);
      scene.add(group);
      clouds.push({ center: center.clone().setY(1.2), radius: p.def.radius, until: now + p.def.duration, group });
      onDetonate({ type: 'smoke', center, def: p.def, thrower: p.thrower });
    } else {
      onDetonate({ type: 'flash', center, def: p.def, thrower: p.thrower });
    }
  }

  return { throwGrenade, step, clouds, projectiles };
}
