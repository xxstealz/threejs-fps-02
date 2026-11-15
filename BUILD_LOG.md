# BUILD LOG — SANDLINE: Sector 7 (threejs-fps-02)

## What was built

A round-based, Counter-Strike-style tactical FPS that runs offline in a browser
on three.js 0.187.0, in `game/` (static ES modules, no build step).

**The game:** 5v5 on "Sector 7", an original dusk desert yard — attackers spawn
south, defenders north, Site A east, Site B west, three lanes (A-long, mid,
B-long) with crates, containers, sandbags and a mid doorway. First to 5 rounds
(max 9), sides swap at the half. Attackers plant a 40-second charge (4 s plant,
5 s defuse); defenders defuse or run the clock out; wiping the other team also
wins the round.

**Features**
- Rounds: buy phase (15 s, frozen) → live (100 s) → round banner → next round →
  match end overlay with the final score and a Play again button.
- Economy: $800 start, $300/kill, $300/plant, $3,250/win, $1,900/loss with a
  $500 streak bonus capped at $2,900. Buy menu (B or number keys): 5 weapons
  (P9 Sidearm free, Vandal-9 SMG $1,500, VK-47 Rifle $2,700, Breacher-12
  Shotgun $1,200, Longbow .50 Sniper $4,750), body armour $650, frag/smoke/flash
  grenades $300/$300/$200. Dying loses the held weapon.
- Bots: 9 of them (4 on the player's squad, 5 on the other side). They walk a
  22-node waypoint graph over the three lanes, hold sites, rotate on gunfire
  and on the plant, and engage with a reaction time (0.28–0.62 s / skill),
  burst fire and aim error — through the same hitscan the player uses. They
  carry and plant the bomb, defuse it, and pick it up when its carrier dies.
- Gunplay: hitscan against torso/head hitboxes (headshots ×4 damage), armour
  absorbing half, recoil and spread that punish firing on the move, crouch and
  jump, AABB collision, tracers, muzzle flash, impact sparks, procedural
  WebAudio gunfire/footsteps/beeps/explosions, sniper scope (right mouse).
- Grenades: frag (radius damage with line-of-sight), smoke (12 s cloud that
  blocks bot vision), flash (blinds by facing and distance).
- HUD: health + armour bars, money, ammo, weapon, grenades, round timer,
  team score, bomb status, kill feed, hitmarker, dynamic crosshair, plant/
  defuse progress bar, damage vignette, flash overlay, round banners.

**Files** (one module per job; `main.js` holds the single game state and the
fixed-step 1/60 s loop, rendering apart from simulation):
- `game/index.html` (10,784 B) + `game/src/`: `main.js`, `world.js` (map +
  waypoint graph), `bots.js` (AI), `weapons.js`, `combat.js` (shared hitscan),
  `grenades.js`, `bomb.js`, `economy.js`, `player.js` (shared mover),
  `effects.js`, `hud.js`, `input.js`, `audio.js`, `rng.js` (seeded),
  `palette.js`. Source total 112,585 B (cap 163,840).
- `game/vendor/three/three.module.min.js` + `three.core.min.js` — 0.187.0,
  byte-for-byte (sha256 matches kit.json); import map `"three"` →
  `./vendor/three/three.module.min.js`.

**Entrypoint:** `main.ts` (root) copies `game/` + `screenshots/` to `/output`
and writes `/output/dossier.json` with `buildDossier` from
`vendor/makefun-threejs.ts` (the kit's copy, unchanged, sha256-verified).
`serve.ts` is a tiny static server for local play. `capture.mjs` takes the
screenshots in `shots.json` (`?shot=` deterministic replays, seed 1) with
headless Chromium at 1280×720 JPEG.

## Local verification

- Kit check: three.js hashes OK; no external references in own source (only
  comments inside the vendored three.js); source 112,585 B ≤ 163,840.
- Screenshots (1280×720, JPEG, all ≤ 256 KiB): 1-start (buy menu, $800,
  owned pistol), 2-play (mid-round, tracer + two bots in view, 11/36 ammo),
  3-plant (bomb glowing red on Site A, A sign, defenders approaching,
  "Bomb planted — Site A — 39s"), 4-end ("Round won", 1–0, $4,050).
- Capture determinism: the ground texture is seeded (mulberry32), so
  re-running `capture.mjs` reproduces the same bytes.
- Playtest (headless Chromium, live game, no `?shot=`): see "Playtest" below.

## Playtest

Live game in headless Chromium (SwiftShader), no `?shot=` — three runs,
zero console errors in all of them.

- **Buy:** frag bought in the buy phase for $300 ($800 → $500, frag ×1).
- **Buy → live:** 15 s buy timer runs out, phase flips to live, timer 100 s.
- **Bots fight:** defenders 5 → 3 → 1, attackers 4 → 2 → 1 across the round;
  the player was shot dead by bots (health 100 → 74 → 22 → 0) and the round
  carried on without them.
- **Bomb drop:** carrier bot Rook died with the bomb; the bomb dropped where
  he fell (`carrier: null`, status "The bomb is down").
- **Round resolves:** round 1 ended by elimination — `phase: roundEnd`,
  SANDLINE 1–0, money $800 → $4,050 ($3,250 win reward), bomb `gone`. Round 2
  then started in the buy phase with health 100 and all 9 bots respawned.
- **Mouse look:** verified with synthetic mousemove events carrying
  `movementX` (what a real browser sends under pointer lock): +100 px →
  yaw −0.220 rad (100 × 0.0022), pitch −0.044; −200 px → yaw +0.220.
  (Playwright's `mouse.move` under pointer lock in the headless shell does not
  synthesize `movementX` — a headless quirk, not a game bug; pointer lock
  itself engaged, `pointerLockElement` true.)
- **Movement:** holding W moved the player forward (z 18.5 → 17.11).
- **Speed note:** SwiftShader renders at ~1 FPS at 1280×720 on this VM, so
  the fixed-step loop (max 5 steps/frame) runs the sim slower than real time
  there — graceful degradation, no spiral. On real hardware it is a normal
  60 FPS game; the screenshots' replays run the same fixed steps regardless.
- **Determinism:** `capture.mjs` run twice produces byte-identical
  screenshots (sha256-verified all four) after seeding the ground texture and
  the impact-spark scatter.

## Known limits / what more time would buy

- Bot skill is one flat band (0.72–0.95) with no per-role tuning and no
  difficulty ramp across rounds; defenders sometimes stack on one site after a
  plant.
- No minimap and no teammate outlines through walls; the kill feed is the
  only squad awareness.
- The sniper scope is a plain FOV zoom (no scope overlay), and grenade
  throws have no trajectory preview.
- Bot voice/callouts don't exist; the only squad communication is the bomb
  status line.
- The map is one yard; a second map or a map vote would add replay value.

## Entrypoint + sizes

- Entrypoint: `main.ts` (repo root) → `/output/dossier.json`.
- `game/`: 16 source files, 112,585 B; vendored three.js 2,133,707 B.
- `screenshots/`: 4 JPEGs, 1280×720, 30–47 KiB each.
