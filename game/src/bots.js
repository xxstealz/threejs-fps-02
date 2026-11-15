// The bots. Nine of them: four on the player's squad, five on the other side. Each
// one has a body that walks the waypoint graph, eyes that check field of view and
// line of sight on a stagger, ears that hear gunfire, and a trigger finger that
// fires the same hitscan the player does — bursts, with a reaction time and aim
// error set by its skill, never a coin flip after the trigger is pulled.
import * as THREE from 'three';
import { createMover } from './player.js';
import { WEAPONS } from './weapons.js';
import { findRoute, nearestNode } from './world.js';
import { aimError, pick, range } from './rng.js';

const NAMES = ['Rook', 'Vex', 'Sable', 'Onyx', 'Dusk', 'Heron', 'Fable', 'Wren', 'Juno'];
const TEAM_COLOR = { atk: 0xc9a86a, def: 0x5b7a99 };
const TEAM_DARK = { atk: 0x8a6f3f, def: 0x3d5568 };
const _eye = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

function buildBotMesh(team) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: TEAM_DARK[team], roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x9a7a5a, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), torsoMat);
  torso.position.y = 1.08;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), darkMat);
  helmet.position.y = 1.78;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), darkMat);
  legL.position.set(-0.13, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.62), darkMat);
  gun.position.set(0.18, 1.28, 0.28);
  group.add(torso, head, helmet, legL, legR, gun);
  return { group, torso, head, legL, legR, gun };
}

function makeHitMeshes(entity, group, torso, head) {
  // Invisible boxes the raycaster hits; they ride the visible mesh so a hit on a
  // shoulder or a helmet is decided by geometry, not by a dice roll.
  const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.82, 0.34), new THREE.MeshBasicMaterial({ visible: false }));
  torsoHit.position.copy(torso.position);
  torsoHit.userData = { part: 'torso', entity };
  const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  headHit.position.copy(head.position);
  headHit.userData = { part: 'head', entity };
  group.add(torsoHit, headHit);
  return [torsoHit, headHit];
}

export function createBots(scene, world, combat, effects, audio, random) {
  const bots = [];
  let idCounter = 0;

  function spawnBot(team, index, spawn, role) {
    const id = idCounter;
    idCounter += 1;
    const name = NAMES[id % NAMES.length];
    const { group, torso, head, legL, legR, gun } = buildBotMesh(team);
    const mover = createMover(world.colliders, spawn.x + (index % 2 ? 1.2 : -1.2), spawn.z + Math.floor(index / 2) * 1.4);
    const entity = {
      id, name, team, role,
      mover, group, gun,
      health: 100, armor: 0, alive: true,
      hitMeshes: [],
      state: 'idle',
      route: [], routeIndex: 0,
      holdNode: null, holdUntil: 0,
      target: null, lastSeen: null, lastSeenAt: -99, reactAt: 0,
      visionAt: random() * 0.15, // staggered vision checks
      burstLeft: 0, pauseUntil: 0, reloadLeft: 0,
      skill: range(random, 0.72, 0.95),
      strafeDir: 1, strafeUntil: 0,
      plantProgress: 0, defuseProgress: 0,
      blindedUntil: 0, carrier: false,
      walkPhase: random() * Math.PI * 2,
      deathT: 0, dead: false,
      weapon: null,
    };
    entity.hitMeshes = makeHitMeshes(entity, group, torso, head);
    entity.legL = legL;
    entity.legR = legR;
    entity.chest = new THREE.Vector3();
    entity.eyePos = new THREE.Vector3();
    scene.add(group);
    bots.push(entity);
    return entity;
  }

  function armBot(bot, weaponId, armor) {
    const def = WEAPONS[weaponId];
    bot.weapon = { def, mag: def.magSize, reserve: def.reserve, cooldown: 0, reloadLeft: 0, burstLeft: 0, pauseUntil: 0 };
    bot.armor = armor;
    bot.health = 100;
    bot.alive = true;
    bot.dead = false;
    bot.deathT = 0;
    bot.group.rotation.set(0, 0, 0);
    bot.group.position.y = 0;
    bot.target = null;
    bot.lastSeen = null;
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    bot.blindedUntil = 0;
    bot.state = 'route';
    bot.route = [];
    bot.routeIndex = 0;
  }

  function resetPositions(teamBots, spawn) {
    teamBots.forEach((bot, i) => {
      bot.mover.state.position.set(spawn.x + (i % 2 ? 1.4 : -1.4), 0, spawn.z + Math.floor(i / 2) * 1.6);
      bot.mover.state.velocity.set(0, 0, 0);
      bot.mover.state.yaw = teamBots[0].team === 'atk' ? 0 : Math.PI;
      bot.group.position.copy(bot.mover.state.position);
      bot.group.rotation.y = bot.mover.state.yaw;
    });
  }

  function eyePos(bot) {
    return bot.eyePos.set(bot.mover.state.position.x, bot.mover.state.position.y + 1.5, bot.mover.state.position.z);
  }
  function chestPos(bot) {
    return bot.chest.set(bot.mover.state.position.x, bot.mover.state.position.y + 1.15, bot.mover.state.position.z);
  }

  // One vision check: the nearest enemy this bot can actually see right now.
  // Enemy chests are kept current by their own step (bots) or by the main loop
  // (the player), so this only reads them.
  function seeEnemy(bot, enemies, clouds) {
    eyePos(bot);
    let best = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      _toTarget.copy(enemy.chest).sub(bot.eyePos);
      const dist = _toTarget.length();
      if (dist > 46 || dist < 0.5) continue;
      _toTarget.multiplyScalar(1 / dist);
      // Field of view: cos 55 degrees.
      const forward = _dir.set(-Math.sin(bot.mover.state.yaw), 0, -Math.cos(bot.mover.state.yaw));
      if (_toTarget.dot(forward) < 0.55 && dist > 3) continue;
      if (!combat.lineOfSight(bot.eyePos, enemy.chest, clouds)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best ? { enemy: best, distance: bestDist } : null;
  }

  function setRoute(bot, nodeNames) {
    bot.route = nodeNames.slice();
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function routeTo(bot, nodeName) {
    const from = nearestNode(world, bot.mover.state.position.x, bot.mover.state.position.z);
    setRoute(bot, findRoute(world, from, nodeName));
  }

  function stepBot(bot, dt, ctx) {
    const { time, phase, player, allEntities, bomb, clouds, soundEvents, onBotShot, onPlant, onDefuse } = ctx;
    const enemies = allEntities.filter((e) => e.team !== bot.team);
    const body = bot.mover.state;
    if (!bot.alive) {
      // Fall over and stay down.
      bot.deathT = Math.min(1, bot.deathT + dt * 2.5);
      bot.group.rotation.z = bot.deathT * Math.PI * 0.5 * (bot.id % 2 ? 1 : -1);
      bot.group.position.y = -bot.deathT * 0.25;
      return;
    }
    if (phase !== 'live') return;
    // Keep the bot's own eye and chest current for everyone else's vision checks.
    eyePos(bot);
    chestPos(bot);

    const blinded = time < bot.blindedUntil;
    // Vision, staggered so nine bots don't raycast on the same frame.
    if (!blinded && time >= bot.visionAt) {
      bot.visionAt = time + 0.15 + bot.id * 0.017;
      const seen = seeEnemy(bot, enemies, clouds);
      if (seen) {
        if (!bot.target) bot.reactAt = time + range(random, 0.28, 0.62) / bot.skill;
        bot.target = seen.enemy;
        bot.lastSeen = seen.enemy.chest.clone();
        bot.lastSeenAt = time;
        bot.state = 'engage';
      } else if (bot.target && time - bot.lastSeenAt > 2.2) {
        bot.target = null;
        if (bot.state === 'engage') {
          bot.state = 'hunt';
          if (bot.lastSeen) routeTo(bot, nearestNode(world, bot.lastSeen.x, bot.lastSeen.z));
        }
      }
    }
    // Hearing: a shot or a plant beep nearby pulls a defender off its hold.
    if (!bot.target && bot.team === 'def') {
      for (const sound of soundEvents) {
        const dx = sound.x - body.position.x;
        const dz = sound.z - body.position.z;
        if (dx * dx + dz * dz < sound.radius * sound.radius && time - sound.time < 1.2) {
          routeTo(bot, nearestNode(world, sound.x, sound.z));
          bot.state = 'hunt';
          break;
        }
      }
    }

    // Bomb carrier plants when the site is clear.
    if (bot.carrier && bomb.state === 'carried' && bot.team === 'atk') {
      const site = world.sites[bomb.targetSite];
      const dx = site.center.x - body.position.x;
      const dz = site.center.z - body.position.z;
      if (dx * dx + dz * dz < site.radius * site.radius) {
        const threat = enemies.some((e) => e.alive && e.chest.distanceToSquared(body.position) < 14 * 14);
        if (!threat && !bot.target) {
          bot.state = 'plant';
        }
      }
    }
    if (bot.state === 'plant') {
      bot.plantProgress += dt / 4;
      if (bot.plantProgress >= 1) {
        bot.plantProgress = 0;
        bot.state = 'route';
        onPlant(bot);
      }
      return; // standing still, planting
    }
    // A defender on a planted bomb defuses it.
    if (bomb.state === 'planted' && bot.team === 'def' && !bot.target) {
      const dx = bomb.position.x - body.position.x;
      const dz = bomb.position.z - body.position.z;
      if (dx * dx + dz * dz < 2.2 * 2.2) {
        bot.state = 'defuse';
        bot.defuseProgress += dt / 5;
        if (bot.defuseProgress >= 1) {
          bot.defuseProgress = 0;
          bot.state = 'route';
          onDefuse(bot);
        }
        return;
      }
      if (bot.state !== 'rotate' && bot.state !== 'hunt') {
        routeTo(bot, nearestNode(world, bomb.position.x, bomb.position.z));
        bot.state = 'rotate';
      }
    }
    if (bot.state === 'defuse') return;

    // Movement: follow the route, or strafe while engaging.
    let wishX = 0;
    let wishZ = 0;
    let speed = 0;
    let wantCrouch = false;
    if (bot.state === 'engage' && bot.target && bot.target.alive) {
      const dx = bot.target.chest.x - body.position.x;
      const dz = bot.target.chest.z - body.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      // Face the target.
      body.yaw = Math.atan2(-dx, -dz);
      // Keep a fighting distance: close in if far, back off if point blank.
      let along = 0;
      if (dist > 14) along = 1;
      else if (dist < 4) along = -0.7;
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + range(random, 0.5, 1.4);
      }
      const strafe = bot.strafeDir * (dist < 20 ? 0.9 : 0.3);
      const fx = -dx / dist;
      const fz = -dz / dist;
      wishX = fx * along + (-fz) * strafe;
      wishZ = fz * along + fx * strafe;
      const len = Math.hypot(wishX, wishZ) || 1;
      wishX /= len;
      wishZ /= len;
      speed = 3.4;
      wantCrouch = dist > 18 && random() < 0.3;
    } else if (bot.state === 'hold') {
      if (time > bot.holdUntil) {
        // Shift to a nearby hold node so defenders don't stand still all round.
        const options = Object.keys(world.nodes).filter((n) => n.includes('Hold') || n.includes('hold'));
        routeTo(bot, pick(random, options));
        bot.holdUntil = time + range(random, 8, 16);
      }
    } else if (bot.route.length > 0) {
      const node = world.nodes[bot.route[bot.routeIndex]];
      if (!node) {
        bot.route = [];
      } else {
        const dx = node[0] - body.position.x;
        const dz = node[1] - body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.8) {
          bot.routeIndex += 1;
          if (bot.routeIndex >= bot.route.length) {
            bot.route = [];
            if (bot.state === 'route') bot.state = bot.team === 'def' ? 'hold' : 'hunt';
            if (bot.state === 'hold') bot.holdUntil = time + range(random, 6, 12);
          }
        } else {
          wishX = dx / dist;
          wishZ = dz / dist;
          speed = bot.team === 'atk' && bot.state === 'route' ? 5.0 : 4.2;
          body.yaw = Math.atan2(-wishX, -wishZ);
        }
      }
    }

    bot.mover.step(dt, wishX, wishZ, speed, wantCrouch, false);
    const moving = bot.mover.groundSpeed();
    bot.walkPhase += dt * moving * 2.2;
    const swing = Math.min(0.5, moving * 0.12) * Math.sin(bot.walkPhase);
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    bot.group.position.copy(body.position);
    bot.group.rotation.y = body.yaw;

    // Footsteps the player can hear.
    if (moving > 2 && Math.sin(bot.walkPhase) > 0.9 && time - (bot.lastStepAt || 0) > 0.3) {
      bot.lastStepAt = time;
      const dist = body.position.distanceTo(player.state.position);
      if (dist < 22) audio.step(dist);
    }

    // Shooting: bursts with a pause, only after the reaction time, only while the
    // target is alive and (mostly) visible.
    const weapon = bot.weapon;
    if (!weapon) return;
    weapon.cooldown = Math.max(0, weapon.cooldown - dt);
    if (weapon.reloadLeft > 0) {
      weapon.reloadLeft -= dt;
      if (weapon.reloadLeft <= 0) {
        const need = weapon.def.magSize - weapon.mag;
        const take = Math.min(need, weapon.reserve);
        weapon.mag += take;
        weapon.reserve -= take;
      }
      return;
    }
    if (weapon.mag === 0) {
      if (weapon.reserve > 0) weapon.reloadLeft = weapon.def.reloadTime;
      return;
    }
    if (bot.target && bot.target.alive && time >= bot.reactAt && time >= weapon.pauseUntil && !blinded) {
      if (weapon.burstLeft <= 0) {
        weapon.burstLeft = bot.weapon.def.kind === 'sniper' ? 1 : 3 + Math.floor(random() * 3);
      }
      if (weapon.cooldown <= 0) {
        weapon.burstLeft -= 1;
        weapon.cooldown = weapon.def.fireGap * range(random, 0.9, 1.25);
        weapon.mag -= 1;
        const dist = bot.target.chest.distanceTo(bot.eyePos);
        const error = (0.0035 + dist * 0.00032 + (moving > 1 ? 0.004 : 0)) / bot.skill;
        _muzzle.copy(bot.eyePos).addScaledVector(_dir.set(-Math.sin(body.yaw), 0, -Math.cos(body.yaw)), 0.5);
        _muzzle.y -= 0.12;
        _dir.copy(bot.target.chest).sub(_muzzle).normalize();
        _dir.x += aimError(random) * error * 2;
        _dir.y += aimError(random) * error * 2;
        _dir.z += aimError(random) * error * 2;
        _dir.normalize();
        const entities = [...bots, player.entity];
        const result = combat.fireHitscan(_muzzle, _dir, weapon.def, bot, entities, random, 0);
        const distToPlayer = _muzzle.distanceTo(player.state.position);
        audio.shoot(weapon.def.kind, Math.max(0, distToPlayer));
        onBotShot(bot, result);
        if (weapon.burstLeft <= 0) {
          weapon.pauseUntil = time + range(random, 0.45, 0.9);
        }
      }
    }
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
  }

  function die(bot, killer) {
    bot.alive = false;
    bot.deathT = 0;
    bot.target = null;
  }

  return {
    bots,
    spawnBot,
    armBot,
    resetPositions,
    step,
    die,
    eyePos,
    chestPos,
    setRoute,
    routeTo,
    living(team) {
      return bots.filter((b) => b.alive && (!team || b.team === team));
    },
  };
}
