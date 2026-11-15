// The one place shooting happens. Player and bots both call fireHitscan with their
// muzzle, direction and weapon; the same raycast, the same damage and armour maths,
// the same tracer and impact. A miss on a wall and a hit on a helmet are decided by
// geometry, never by a coin flip.
import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _targets = [];
const _point = new THREE.Vector3();

export function createCombat(world, effects, audio) {
  return {
    // origin: muzzle world position. direction: unit vector. def: weapon definition.
    // shooter: the entity shooting (skipped as a target). entities: all living bodies.
    // random: the shared seeded rng. spread: radians added to the direction.
    fireHitscan(origin, direction, def, shooter, entities, random, spread) {
      _dir.copy(direction);
      if (spread > 0) {
        _dir.x += (random() + random() - 1) * spread;
        _dir.y += (random() + random() - 1) * spread;
        _dir.z += (random() + random() - 1) * spread;
        _dir.normalize();
      }
      _ray.set(origin, _dir);
      _ray.far = def.range;
      _targets.length = 0;
      for (const mesh of world.shootables) _targets.push(mesh);
      for (const entity of entities) {
        if (!entity.alive || entity === shooter) continue;
        for (const mesh of entity.hitMeshes) _targets.push(mesh);
      }
      const hits = _ray.intersectObjects(_targets, false);
      const end = _point.copy(origin).addScaledVector(_dir, def.range);
      if (hits.length === 0) {
        effects.spawnTracer(origin, end, shooter.team === 'atk' ? 0xe8a33d : 0x7fb4d8);
        return { hit: false };
      }
      const hit = hits[0];
      effects.spawnTracer(origin, hit.point, shooter.team === 'atk' ? 0xe8a33d : 0x7fb4d8);
      const part = hit.object.userData.part;
      if (part) {
        const entity = hit.object.userData.entity;
        // No friendly fire: a teammate in the line of fire blocks the shot, but
        // takes no damage.
        if (entity.team === shooter.team) {
          return { hit: true, friendly: true, point: hit.point };
        }
        const headshot = part === 'head';
        let damage = def.damage * (headshot ? def.headMult : 1);
        let absorbed = 0;
        if (entity.armor > 0) {
          absorbed = Math.min(entity.armor, damage * 0.5);
          entity.armor -= absorbed;
          damage -= absorbed;
        }
        entity.health -= damage;
        const killed = entity.health <= 0;
        if (killed) entity.health = 0;
        return { hit: true, entity, damage, headshot, killed, point: hit.point, absorbed };
      }
      effects.spawnImpact(hit.point, hit.face ? hit.face.normal : null);
      return { hit: false, wall: true, point: hit.point };
    },

    // Line of sight between two world points: clear if nothing in the world blocks it.
    // Smoke clouds block sight too, when a cloud list is given.
    lineOfSight(from, to, clouds = null) {
      _dir.copy(to).sub(from);
      const distance = _dir.length();
      if (distance < 0.001) return true;
      _dir.multiplyScalar(1 / distance);
      _ray.set(from, _dir);
      _ray.far = distance;
      const hits = _ray.intersectObjects(world.shootables, false);
      if (hits.length > 0) return false;
      if (clouds) {
        for (const cloud of clouds) {
          if (segmentIntersectsSphere(from, to, cloud.center, cloud.radius)) return false;
        }
      }
      return true;
    },
  };
}

function segmentIntersectsSphere(a, b, center, radius) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = center.x - a.x;
  const acy = center.y - a.y;
  const acz = center.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = lenSq > 0 ? (acx * abx + acy * aby + acz * abz) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = a.x + abx * t - center.x;
  const dy = a.y + aby * t - center.y;
  const dz = a.z + abz * t - center.z;
  return dx * dx + dy * dy + dz * dz < radius * radius;
}
