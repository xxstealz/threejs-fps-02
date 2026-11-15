// SANDLINE — Sector 7. One game state, one loop. The loop is fixed-step (1/60 s) so
// a screenshot replay and a live session run the same simulation; rendering is the
// only part that follows the display. All damage, all money, all round endings flow
// through the functions below — nothing ends a round by accident.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createWeaponInstance, WEAPONS, GRENADES } from './weapons.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createGrenades } from './grenades.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEconomy, KILL_REWARD, PLANT_REWARD } from './economy.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { mulberry32, pick } from './rng.js';

const FIXED_DT = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);
window.__shotMode = Boolean(SHOT);

const random = mulberry32(SEED);
const audio = createAudio();
const hud = createHud();

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b1d16');
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene, random);
const combat = createCombat(world, effects, audio);
const grenades = createGrenades(scene, world, combat, random);
const bomb = createBomb();
const economy = createEconomy();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement);
const bots = createBots(scene, world, combat, effects, audio, random);
// Four bots on the player's squad, five on the other side — a 5v5 with the player.
for (let i = 0; i < 4; i += 1) bots.spawnBot('atk', i, world.spawnAtk, 'entry');
for (let i = 0; i < 5; i += 1) bots.spawnBot('def', i, world.spawnDef, 'rotator');

// The player, as a combat entity: the bots shoot at these hit meshes, and the
// grenades damage this chest. Health lives on the mover, armour in the economy.
const playerEntity = {
  name: 'You', team: 'atk', alive: true,
  get health() { return player.state.health; },
  set health(v) { player.state.health = v; },
  get armor() { return economy.state.armor; },
  set armor(v) { economy.state.armor = v; },
  chest: new THREE.Vector3(),
  eyePos: new THREE.Vector3(),
  hitMeshes: [],
};
{
  const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.82, 0.34), new THREE.MeshBasicMaterial({ visible: false }));
  torsoHit.userData = { part: 'torso', entity: playerEntity };
  const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  headHit.userData = { part: 'head', entity: playerEntity };
  scene.add(torsoHit, headHit);
  playerEntity.hitMeshes = [torsoHit, headHit];
}

// The single game state.
const Game = {
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  round: 1,
  scores: { atk: 0, def: 0 },
  playerSide: 'atk',
  timer: BUY_SECONDS,
  time: 0,
  roundEndAt: 0,
  carrier: null, // 'player' or a bot
  site: 'A',
  useProgress: 0,
  useKind: null, // 'plant' | 'defuse'
  playerDead: false,
  matchWinner: null,
  soundEvents: [],
  botTeamWonLast: { atk: false, def: false },
  frozen: false, // shot mode: freeze the sim once the capture is ready
};
const allEntities = [playerEntity, ...bots.bots];

let weaponInstances = {};
let currentWeapon = null;
let selectedGrenade = 'frag';
let wasFiring = false;
let scoped = false;
let accumulator = 0;
let lastFrame = performance.now();

function enemyBots() {
  return bots.bots.filter((b) => b.team !== Game.playerSide);
}

function equipWeapon(id) {
  if (!economy.state.weapons.includes(id)) return;
  if (currentWeapon) currentWeapon.state.model.visible = false;
  if (!weaponInstances[id]) {
    weaponInstances[id] = createWeaponInstance(camera, WEAPONS[id]);
  }
  currentWeapon = weaponInstances[id];
  currentWeapon.state.model.visible = true;
  currentWeapon.state.flashMesh.visible = false;
  economy.state.current = id;
  hud.setWeapon(WEAPONS[id].name, economy.state.grenades);
  updateAmmoHud();
}

function updateAmmoHud() {
  if (!currentWeapon) return;
  hud.setAmmo(currentWeapon.state.mag, currentWeapon.state.reserve, currentWeapon.state.mag === 0);
}

function resetPlayerForRound() {
  const spawn = Game.playerSide === 'atk' ? world.spawnAtk : world.spawnDef;
  player.state.position.copy(spawn);
  player.state.position.x += 1.5;
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = Game.playerSide === 'atk' ? 0 : Math.PI;
  player.state.pitch = 0;
  player.state.health = 100;
  player.state.alive = true;
  playerEntity.alive = true;
  playerEntity.team = Game.playerSide;
  Game.playerDead = false;
  camera.position.copy(player.state.position);
  camera.position.y += player.state.eye;
  camera.rotation.set(player.state.pitch, player.state.yaw, 0);
  scoped = false;
}

function botLoadout(bot, round) {
  // Pistol round first, rifles after; armour if the bot's team won last round.
  if (round === 1) {
    return { weapon: bot.role === 'awper' ? 'smg' : 'pistol', armor: 0 };
  }
  const weapon = bot.role === 'awper' ? 'sniper' : bot.role === 'holder' ? pick(random, ['shotgun', 'rifle']) : 'rifle';
  return { weapon, armor: Game.botTeamWonLast[bot.team] ? 100 : 0 };
}

function assignRoles() {
  const atk = bots.bots.filter((b) => b.team === 'atk');
  const def = bots.bots.filter((b) => b.team === 'def');
  // Attackers: one carrier, one awper, the rest entries.
  atk.forEach((bot, i) => {
    bot.role = i === 0 ? 'carrier' : i === 1 ? 'awper' : 'entry';
  });
  def.forEach((bot, i) => {
    bot.role = i === 0 ? 'awper' : i === 1 ? 'holder' : 'rotator';
  });
  // Attackers split across the three lanes; the carrier takes mid.
  const lanes = ['toA_long', 'toB_long', 'toA_mid', 'toB_mid'];
  atk.forEach((bot, i) => {
    const loadout = botLoadout(bot, Game.round);
    bots.armBot(bot, loadout.weapon, loadout.armor);
    const route = bot.role === 'carrier' ? (Game.site === 'A' ? 'toA_mid' : 'toB_mid') : lanes[i % lanes.length];
    bots.setRoute(bot, world.routes[route]);
  });
  // Defenders: two on each site, one watching mid.
  const holds = ['defA', 'defB', 'defMid', 'defA', 'defB'];
  def.forEach((bot, i) => {
    const loadout = botLoadout(bot, Game.round);
    bots.armBot(bot, loadout.weapon, loadout.armor);
    bots.setRoute(bot, world.routes[holds[i % holds.length]]);
  });
  bots.resetPositions(atk, world.spawnAtk);
  bots.resetPositions(def, world.spawnDef);
}

function startRound(round) {
  Game.round = round;
  Game.playerSide = round <= 4 ? 'atk' : 'def';
  Game.site = round % 2 === 1 ? 'A' : 'B';
  Game.phase = 'buy';
  Game.timer = BUY_SECONDS;
  Game.useProgress = 0;
  Game.useKind = null;
  Game.soundEvents = [];
  // Sides swap at the half: recolour the bots to their new team.
  if (round === 5) {
    for (const bot of bots.bots) bot.team = bot.team === 'atk' ? 'def' : 'atk';
    recolorBots();
  }
  assignRoles();
  resetPlayerForRound();
  // The bomb: the player carries it half the time they attack.
  const atkBots = bots.bots.filter((b) => b.team === 'atk');
  const carrier = Game.playerSide === 'atk' && random() < 0.5
    ? 'player'
    : pick(random, atkBots);
  Game.carrier = carrier;
  for (const bot of atkBots) bot.carrier = bot === carrier;
  bomb.reset(carrier, Game.site);
  // Fresh weapon instances for what the player owns.
  for (const instance of Object.values(weaponInstances)) instance.dispose();
  weaponInstances = {};
  currentWeapon = null;
  equipWeapon(economy.state.current);
  hud.setScore(Game.scores.atk, Game.scores.def);
  hud.setMoney(economy.state.money);
  hud.setHealth(100);
  hud.setArmor(economy.state.armor);
  hud.setBombStatus(Game.carrier === 'player' ? `You carry the bomb — plant at Site ${Game.site}` : `${carrier.name} carries the bomb — Site ${Game.site}`);
  hud.showBuy(true, economy.state, Game.round);
  hud.banner(`Round ${round}`, Game.playerSide === 'atk' ? `Attack — plant at Site ${Game.site}` : `Defend Sites A and B`);
  hud.useBar(false);
}

function recolorBots() {
  const colors = { atk: 0xc9a86a, def: 0x5b7a99 };
  const darks = { atk: 0x8a6f3f, def: 0x3d5568 };
  for (const bot of bots.bots) {
    bot.group.traverse((child) => {
      if (!child.isMesh || !child.material || child.material.visible === false) return;
      if (child.geometry.type === 'BoxGeometry' && child.geometry.parameters.width === 0.52) {
        child.material.color.setHex(colors[bot.team]);
      } else if (child.geometry.type === 'BoxGeometry' && child.geometry.parameters.width === 0.34) {
        child.material.color.setHex(darks[bot.team]);
      }
    });
  }
}

function startMatch() {
  economy.resetMatch();
  Game.scores = { atk: 0, def: 0 };
  Game.round = 1;
  Game.matchWinner = null;
  Game.botTeamWonLast = { atk: false, def: false };
  // A rematch starts from the original sides: the first four bots attack with the
  // player, the other five defend.
  bots.bots.forEach((bot, i) => { bot.team = i < 4 ? 'atk' : 'def'; });
  recolorBots();
  startRound(1);
}

function endRound(winner, reason) {
  if (Game.phase !== 'live') return;
  Game.phase = 'roundEnd';
  Game.scores[winner] += 1;
  Game.botTeamWonLast[winner] = true;
  Game.botTeamWonLast[winner === 'atk' ? 'def' : 'atk'] = false;
  const playerWon = Game.playerSide === winner;
  economy.awardRound(playerWon);
  hud.setScore(Game.scores.atk, Game.scores.def);
  hud.setMoney(economy.state.money);
  hud.showBuy(false);
  hud.useBar(false);
  hud.setBombStatus('');
  if (playerWon) audio.roundWin();
  else audio.roundLose();
  const sideName = winner === 'atk' ? 'SANDLINE' : 'IRONHOLD';
  hud.banner(playerWon ? 'Round won' : 'Round lost', `${sideName} takes it — ${reason}`, playerWon ? 'win' : 'lose');
  Game.roundEndAt = Game.time + 4;
  bomb.clear();
}

function endMatch() {
  Game.phase = 'matchEnd';
  const winner = Game.scores.atk > Game.scores.def ? 'atk' : 'def';
  Game.matchWinner = winner;
  const playerWon = Game.playerSide === winner;
  const overlay = document.getElementById('overlay');
  document.getElementById('overlay-title').innerHTML = playerWon ? 'Match won <span>— Sector 7 is yours</span>' : 'Match lost <span>— Sector 7 holds</span>';
  document.getElementById('overlay-copy').textContent = `Final score: SANDLINE ${Game.scores.atk} — ${Game.scores.def} IRONHOLD. First to five rounds takes the match.`;
  document.getElementById('play').textContent = 'Play again';
  overlay.hidden = false;
  document.exitPointerLock?.();
}

function handleDeath(victim, killer, weaponName, headshot) {
  const killerIsPlayer = killer === playerEntity;
  const victimIsPlayer = victim === playerEntity;
  if (victimIsPlayer) {
    player.state.alive = false;
    playerEntity.alive = false;
    Game.playerDead = true;
    economy.onDeath();
    hud.banner('You were eliminated', 'Your squad fights on — watch the round finish', 'lose');
    audio.hurt();
  } else {
    bots.die(victim, killer);
  }
  hud.killfeed(killer.name, victim.name, weaponName, headshot, killerIsPlayer, victimIsPlayer);
  if (killerIsPlayer) {
    economy.add(KILL_REWARD);
    hud.setMoney(economy.state.money);
  }
  if (victim === Game.carrier) {
    // The bomb drops where its carrier fell; a teammate picks it up by walking over it.
    const dropPos = victim === playerEntity ? player.state.position : victim.mover.state.position;
    Game.carrier = null;
    bomb.state.state = 'carried';
    bomb.state.carrier = null;
    bomb.state.position = dropPos.clone();
    hud.setBombStatus('The bomb is down — pick it up by walking over it');
  }
}

function checkRoundEnd() {
  if (Game.phase !== 'live') return;
  const atkAlive = bots.living('atk').length + (Game.playerSide === 'atk' && playerEntity.alive ? 1 : 0);
  const defAlive = bots.living('def').length + (Game.playerSide === 'def' && playerEntity.alive ? 1 : 0);
  if (bomb.state.state === 'exploded') {
    endRound('atk', 'the charge detonated');
  } else if (bomb.state.state === 'defused') {
    endRound('def', 'the charge was defused');
  } else if (atkAlive === 0 && bomb.state.state !== 'planted') {
    endRound('def', 'SANDLINE was wiped out');
  } else if (defAlive === 0) {
    endRound('atk', 'IRONHOLD was wiped out');
  } else if (Game.timer <= 0 && bomb.state.state !== 'planted') {
    endRound('def', 'time ran out with the bomb unplanted');
  }
}

// ----- player shooting -------------------------------------------------------

const _muzzle = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function playerShoot() {
  if (!currentWeapon || !currentWeapon.ready()) return;
  if (!currentWeapon.takeRound()) return;
  currentWeapon.pullTrigger();
  camera.getWorldDirection(_forward);
  _muzzle.copy(camera.position).addScaledVector(_forward, 0.5);
  _right.crossVectors(_forward, _up).normalize();
  _muzzle.addScaledVector(_right, 0.14).addScaledVector(_up, -0.1);
  const spread = currentWeapon.spread(player.groundSpeed());
  const def = currentWeapon.state.def;
  const results = [];
  for (let p = 0; p < def.pellets; p += 1) {
    results.push(combat.fireHitscan(_muzzle, _forward, def, playerEntity, allEntities, random, spread));
  }
  const hit = results.find((r) => r.hit);
  if (hit) {
    hud.hitmarker(hit.killed);
    audio.hit(hit.killed);
    if (hit.killed) handleDeath(hit.entity, playerEntity, def.name, hit.headshot);
  }
  audio.shoot(def.kind, 0);
  Game.soundEvents.push({ x: player.state.position.x, z: player.state.position.z, radius: 26, time: Game.time });
  const kick = def.kind === 'sniper' ? 0.028 : def.kind === 'shotgun' ? 0.02 : 0.007;
  player.recoil(kick, (random() - 0.5) * kick * 0.5);
  updateAmmoHud();
}

function playerThrowGrenade() {
  const type = selectedGrenade;
  if (economy.state.grenades[type] <= 0) return;
  camera.getWorldDirection(_forward);
  const origin = camera.position.clone().addScaledVector(_forward, 0.6);
  const def = GRENADES[type];
  if (grenades.throwGrenade(origin, _forward, type, def, playerEntity)) {
    economy.state.grenades[type] -= 1;
    audio.grenadePin();
    hud.setWeapon(WEAPONS[economy.state.current].name, economy.state.grenades);
  }
}

function onGrenadeDetonate(event) {
  if (event.type === 'frag') {
    const dist = event.center.distanceTo(player.state.position);
    audio.explosion(dist);
    for (const victim of event.killed ?? []) {
      handleDeath(victim, event.thrower, 'Frag Grenade', false);
    }
  } else if (event.type === 'flash') {
    // Blinded if looking at the pop with a clear line of sight.
    const entities = [playerEntity, ...bots.bots];
    for (const entity of entities) {
      const eye = entity === playerEntity ? playerEntity.eyePos : entity.eyePos;
      _forward.copy(event.center).sub(eye);
      const dist = _forward.length();
      if (dist > event.def.radius) continue;
      _forward.multiplyScalar(1 / dist);
      if (!combat.lineOfSight(eye, event.center)) continue;
      if (entity === playerEntity) {
        camera.getWorldDirection(_dir);
        const facing = _dir.dot(_forward);
        if (facing > 0.3) hud.flashWhite((1 - dist / event.def.radius) * 0.9 + 0.3);
      } else {
        entity.blindedUntil = Game.time + event.def.duration * (1 - dist / event.def.radius * 0.5);
      }
    }
  }
}
const _dir = new THREE.Vector3();

// ----- the fixed-step simulation --------------------------------------------

function step(dt) {
  Game.time += dt;
  const body = player.state;

  if (Game.phase === 'buy') {
    Game.timer -= dt;
    if (Game.timer <= 0) {
      Game.phase = 'live';
      Game.timer = ROUND_SECONDS;
      hud.showBuy(false);
      hud.banner('Go!', Game.playerSide === 'atk' ? `Plant at Site ${Game.site}` : 'Hold the sites');
    }
  } else if (Game.phase === 'live') {
    if (bomb.state.state === 'planted') {
      Game.timer = bomb.state.timer;
    } else {
      Game.timer -= dt;
    }
    const bombStep = bomb.step(Game.time);
    if (bombStep?.beep) audio.plantBeep(bombStep.fast);
    if (bomb.state.state === 'planted' && bomb.state.timer <= 0) {
      bomb.explode();
      effects.setBombVisible(false);
      const dist = bomb.state.position.distanceTo(player.state.position);
      audio.explosion(dist);
      endRound('atk', 'the charge detonated');
    }
  } else if (Game.phase === 'roundEnd' && Game.time >= Game.roundEndAt) {
    if (Game.scores.atk >= WIN_ROUNDS || Game.scores.def >= WIN_ROUNDS || Game.round >= MAX_ROUNDS) {
      endMatch();
    } else {
      startRound(Game.round + 1);
    }
  }

  // Player look and movement (frozen in the buy phase, dead, or in a menu).
  const frozen = Game.phase === 'buy' || Game.phase === 'menu' || Game.phase === 'matchEnd' || Game.playerDead;
  const look = input.consumeLook();
  if (!frozen && input.locked) player.look(look.dx, look.dy);
  if (!frozen && playerEntity.alive) player.step(dt, input.keys);
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0);

  // Scope: right mouse on the sniper narrows the view.
  const wantScoped = input.rightMouse && currentWeapon?.state.def.scoped && Game.phase === 'live';
  if (wantScoped !== scoped) {
    scoped = wantScoped;
    camera.fov = scoped ? 30 : 75;
    camera.updateProjectionMatrix();
  }

  // Player hit meshes follow the body, so bots can shoot at the player.
  playerEntity.chest.set(body.position.x, body.position.y + 1.15, body.position.z);
  playerEntity.eyePos.set(body.position.x, body.position.y + body.eye, body.position.z);
  playerEntity.hitMeshes[0].position.copy(playerEntity.chest);
  playerEntity.hitMeshes[1].position.set(body.position.x, body.position.y + 1.62, body.position.z);

  if (currentWeapon) {
    currentWeapon.step(dt);
    updateAmmoHud();
  }

  // Discrete actions, drained once a frame.
  for (const code of input.drainActions()) {
    if (Game.phase === 'buy' && hudBuyOpen()) {
      const bought = buyKey(code);
      if (bought) continue;
    }
    if (code === 'KeyB' && Game.phase === 'buy') {
      hud.showBuy(!hudBuyOpen(), economy.state, Game.round);
      continue;
    }
    if (code === 'KeyR' && currentWeapon) {
      if (currentWeapon.reload()) audio.reload();
    }
    if (code === 'KeyG' && Game.phase === 'live' && playerEntity.alive) playerThrowGrenade();
    if (code.startsWith('Digit') && Game.phase === 'live') {
      const slot = Number(code.slice(5)) - 1;
      if (slot < 3 && economy.state.weapons[slot]) equipWeapon(economy.state.weapons[slot]);
      if (slot === 3 && economy.state.grenades.frag > 0) selectedGrenade = 'frag';
      if (slot === 4 && economy.state.grenades.smoke > 0) selectedGrenade = 'smoke';
      if (slot === 5 && economy.state.grenades.flash > 0) selectedGrenade = 'flash';
    }
  }
  const wheel = input.consumeWheel();
  if (wheel !== 0 && Game.phase === 'live') {
    const idx = economy.state.weapons.indexOf(economy.state.current);
    const next = economy.state.weapons[(idx + (wheel > 0 ? 1 : -1) + economy.state.weapons.length) % economy.state.weapons.length];
    equipWeapon(next);
  }

  // Firing: auto weapons hold, semi-auto fire on the rising edge.
  const firing = input.firing && input.locked && Game.phase === 'live' && playerEntity.alive;
  const def = currentWeapon?.state.def;
  if (firing && def && (def.auto || !wasFiring)) {
    if (currentWeapon.state.mag === 0) {
      if (currentWeapon.reload()) audio.reload();
      else audio.dryFire();
    } else {
      playerShoot();
    }
  }
  wasFiring = firing;

  // Plant / defuse: hold E.
  Game.useKind = null;
  if (Game.phase === 'live' && playerEntity.alive && input.keys.has('KeyE')) {
    if (Game.carrier === 'player' && bomb.state.state === 'carried') {
      const site = world.sites[Game.site];
      const dx = site.center.x - body.position.x;
      const dz = site.center.z - body.position.z;
      if (dx * dx + dz * dz < site.radius * site.radius) {
        Game.useKind = 'plant';
        Game.useProgress += dt / 4;
        if (Game.useProgress >= 1) {
          Game.useProgress = 0;
          bomb.plant(body.position, Game.time);
          economy.add(PLANT_REWARD);
          hud.setMoney(economy.state.money);
          hud.setBombStatus(`Bomb planted — Site ${Game.site}`);
          audio.beep();
        }
      }
    } else if (bomb.state.state === 'planted' && Game.playerSide === 'def') {
      const dx = bomb.state.position.x - body.position.x;
      const dz = bomb.state.position.z - body.position.z;
      if (dx * dx + dz * dz < 2.2 * 2.2) {
        Game.useKind = 'defuse';
        Game.useProgress += dt / 5;
        if (Game.useProgress >= 1) {
          Game.useProgress = 0;
          bomb.defuse();
          hud.setBombStatus('Bomb defused');
          endRound('def', 'the charge was defused');
        }
      }
    }
  }
  if (Game.useKind) {
    hud.useBar(true, Game.useKind === 'plant' ? 'Planting the charge…' : 'Defusing…', Game.useProgress);
  } else {
    Game.useProgress = 0;
    hud.useBar(false);
  }

  // Bots, grenades, effects.
  const ctx = {
    time: Game.time,
    phase: Game.phase,
    player: { state: player.state, entity: playerEntity },
    allEntities,
    bomb: bomb.state,
    clouds: grenades.clouds,
    soundEvents: Game.soundEvents.filter((s) => Game.time - s.time < 2),
    onBotShot(bot, result) {
      if (!result.hit) return;
      if (result.entity === playerEntity) {
        hud.damageFlash();
        audio.hurt();
        if (result.killed) handleDeath(playerEntity, bot, bot.weapon.def.name, result.headshot);
      } else if (result.killed) {
        handleDeath(result.entity, bot, bot.weapon.def.name, result.headshot);
      }
    },
    onPlant(bot) {
      if (bomb.state.state !== 'carried') return;
      bomb.plant(bot.mover.state.position, Game.time);
      hud.setBombStatus(`Bomb planted — Site ${Game.site}`);
      audio.beep();
    },
    onDefuse() {
      bomb.defuse();
      hud.setBombStatus('Bomb defused');
      endRound('def', 'the charge was defused');
    },
  };
  bots.step(dt, ctx);
  grenades.step(dt, Game.time, allEntities, onGrenadeDetonate);
  effects.step(dt);
  if (bomb.state.state === 'planted') {
    effects.setBombVisible(true, bomb.state.position, Game.time % 1 < 0.5);
  } else {
    effects.setBombVisible(false);
  }
  // Picking up a dropped bomb: walk over it.
  if (bomb.state.state === 'carried' && bomb.state.carrier === null && bomb.state.position && Game.playerSide === 'atk' && playerEntity.alive) {
    const drop = bomb.state.position;
    const playerDist = player.state.position.distanceTo(drop);
    if (playerDist < 1.6) {
      Game.carrier = 'player';
      bomb.state.carrier = 'player';
      for (const bot of bots.bots) bot.carrier = false;
      hud.setBombStatus(`You carry the bomb — plant at Site ${Game.site}`);
      audio.beep();
    } else {
      const nearest = bots.bots.find((b) => b.alive && b.team === 'atk' && b.mover.state.position.distanceTo(drop) < 1.6);
      if (nearest) {
        nearest.carrier = true;
        bomb.state.carrier = nearest;
        Game.carrier = nearest;
        bots.setRoute(nearest, world.routes[Game.site === 'A' ? 'toA_mid' : 'toB_mid']);
        hud.setBombStatus(`${nearest.name} picked up the bomb — Site ${Game.site}`);
      }
    }
  }

  checkRoundEnd();

  // HUD numbers.
  hud.setHealth(player.state.health);
  hud.setArmor(economy.state.armor);
  hud.setTimer(Game.timer, Game.timer <= 10 && Game.phase === 'live');
  hud.setCrosshairGap(currentWeapon ? currentWeapon.spread(player.groundSpeed()) * 900 : 6);
  if (bomb.state.state === 'planted') {
    hud.setBombStatus(`Bomb planted — Site ${Game.site} — ${Math.ceil(bomb.state.timer)}s`);
  }
}

let buyMenuOpen = false;
function hudBuyOpen() {
  return buyMenuOpen;
}

function buyKey(code) {
  const map = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'sniper', Digit5: 'armor', Digit6: 'frag', Digit7: 'smoke', Digit8: 'flash' };
  const id = map[code];
  if (!id) return false;
  const result = economy.buy(id);
  if (result.ok) {
    audio.buy();
    if (result.kind === 'weapon') {
      if (!weaponInstances[id]) weaponInstances[id] = createWeaponInstance(camera, WEAPONS[id]);
      equipWeapon(id);
    }
    hud.setMoney(economy.state.money);
    hud.setArmor(economy.state.armor);
    hud.showBuy(true, economy.state, Game.round);
  }
  return true;
}

// Track buy-menu visibility (the HUD owns the DOM, this owns the fact).
const _showBuy = hud.showBuy;
hud.showBuy = (show, ...rest) => {
  buyMenuOpen = show;
  return _showBuy(show, ...rest);
};

// ----- boot, play, and the screenshot replays ------------------------------

document.getElementById('play').addEventListener('click', () => {
  audio.unlock();
  input.lock();
  const overlay = document.getElementById('overlay');
  if (Game.phase === 'menu' || Game.phase === 'matchEnd') {
    overlay.hidden = true;
    startMatch();
  } else {
    overlay.hidden = true;
  }
});

document.addEventListener('pointerlockchange', () => {
  const overlay = document.getElementById('overlay');
  if (!input.locked && (Game.phase === 'live' || Game.phase === 'buy') && !window.__shotMode) {
    document.getElementById('overlay-title').textContent = 'Paused';
    document.getElementById('overlay-copy').textContent = 'Click to resume — the round is waiting.';
    document.getElementById('play').textContent = 'Resume';
    overlay.hidden = false;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function render() {
  renderer.render(scene, camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!Game.frozen) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 5) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
  }
  render();
}

// Deterministic replays for the dossier screenshots. Each one sets up the same
// scene the same way every time, steps the simulation, freezes it, and says ready.
function setupShot(name) {
  const overlay = document.getElementById('overlay');
  overlay.hidden = true;
  startMatch();
  if (name === 'start') {
    // Buy phase at spawn, buy menu open, looking down mid.
    for (let i = 0; i < 30; i += 1) step(FIXED_DT);
    render();
  } else if (name === 'play') {
    // Live, mid-round: the player is in mid, a defender is in the doorway.
    startRoundLiveForShot();
    hud.hideBanner();
    for (let i = 0; i < 360; i += 1) step(FIXED_DT);
    // Step into mid for a close, readable fight, then aim at the nearest living
    // enemy with a clear line of sight and fire once, so a tracer is in the frame.
    player.state.position.set(0, 0, 10);
    player.state.velocity.set(0, 0, 0);
    const eye = new THREE.Vector3(0, player.state.eye, 10);
    const enemy = enemyBots().filter((b) => b.alive && combat.lineOfSight(eye, b.chest)).sort((a, b) => a.chest.distanceToSquared(eye) - b.chest.distanceToSquared(eye))[0];
    if (enemy && currentWeapon) {
      const chest = enemy.chest;
      camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
      _forward.copy(chest).sub(camera.position).normalize();
      player.state.yaw = Math.atan2(-_forward.x, -_forward.z);
      player.state.pitch = Math.asin(Math.max(-1, Math.min(1, _forward.y)));
      camera.rotation.set(player.state.pitch, player.state.yaw, 0);
      playerShoot();
    }
    render();
  } else if (name === 'plant') {
    // The charge is down on Site A, ticking; the player covers it from the crates.
    startRoundLiveForShot();
    hud.hideBanner();
    const site = world.sites.A;
    bomb.plant(new THREE.Vector3(site.center.x - 1, 0, site.center.z + 1), Game.time);
    hud.setBombStatus('Bomb planted — Site A — 38s');
    player.state.position.set(18, 0, -1);
    player.state.velocity.set(0, 0, 0);
    // Face the charge itself, so the bomb and its red light are in the frame.
    const toBomb = new THREE.Vector3(site.center.x - 1, 0.4, site.center.z + 1).sub(new THREE.Vector3(player.state.position.x, player.state.eye, player.state.position.z));
    player.state.yaw = Math.atan2(-toBomb.x, -toBomb.z);
    player.state.pitch = Math.asin(Math.max(-1, Math.min(1, toBomb.clone().normalize().y)));
    camera.rotation.set(player.state.pitch, player.state.yaw, 0);
    for (let i = 0; i < 60; i += 1) step(FIXED_DT);
    render();
  } else if (name === 'end') {
    startRoundLiveForShot();
    endRound('atk', 'IRONHOLD was wiped out');
    hud.setScore(Game.scores.atk, Game.scores.def);
    for (let i = 0; i < 30; i += 1) step(FIXED_DT);
    render();
  }
  Game.frozen = true;
  window.__shotReady = true;
}

function startRoundLiveForShot() {
  // Skip the buy phase: jump straight into a live round.
  Game.phase = 'live';
  Game.timer = ROUND_SECONDS;
  hud.showBuy(false);
}

if (SHOT) {
  setupShot(SHOT);
} else {
  hud.setScore(0, 0);
  hud.setMoney(economy.state.money);
}
// A small handle for playtests and debugging: the live game state, nothing secret.
window.__sandline = { Game, economy, bots, player, bomb, world };
requestAnimationFrame(frame);
