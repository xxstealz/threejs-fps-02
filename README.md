# SANDLINE — Sector 7

A round-based, Counter-Strike-style tactical FPS that runs offline in a browser,
built with three.js 0.187.0. Five on five in a desert yard: plant the charge on
Site A or Site B, or wipe the other team out. First to five rounds takes the match.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

Click to play. The buy menu opens at the start of every round.

| Key | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Click | Fire (hold for automatics) |
| R | Reload |
| 1–3 | Switch weapon · 4–6 select grenade · G throw |
| E (hold) | Plant / defuse |
| B | Buy menu (buy phase) |
| Ctrl / C | Crouch · Space jump · Right mouse | Sniper scope |

## The game

- **Rounds and sides** — 5v5, first to 5 (max 9 rounds), sides swap at the half.
  Attackers plant, defenders defuse or run the clock out.
- **Economy** — $800 start, $300 a kill, $300 a plant, $3,250 a round win,
  $1,900+ a loss (streak bonus, capped at $2,900). Five guns, three grenades,
  body armour, all in the buy menu.
- **Bots** — nine of them, walking a waypoint graph over three lanes, holding
  sites, rotating on sound and on the plant, engaging with reaction time, burst
  fire and aim error through the same hitscan the player uses. They carry and
  plant the bomb, and defuse it.
- **Gunplay** — hitscan against torso and head hitboxes (headshots ×4),
  armour absorbing half, recoil and spread that punish firing on the move,
  tracers, muzzle flash, procedural WebAudio gunfire, footsteps and beeps.
- **The map** — Sector 7: a dusk desert yard with A-long, mid and B-long,
  crates, containers, sandbags and a mid doorway, lit by a low sun and lane lamps.

## Files

- `game/index.html` — the page and HUD.
- `game/src/` — one module per job: `main.js` (the single game state and the
  fixed-step loop), `world.js` (map + waypoint graph), `bots.js` (AI),
  `weapons.js`, `combat.js` (shared hitscan), `grenades.js`, `bomb.js`,
  `economy.js`, `player.js` (shared mover), `effects.js`, `hud.js`,
  `input.js`, `audio.js`, `rng.js` (seeded), `palette.js`.
- `game/vendor/three/` — three.js 0.187.0, vendored byte for byte.
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json`.
- `capture.mjs` — takes the screenshots in `shots.json` (deterministic
  `?shot=` replays) with headless Chromium.
- `screenshots/` — the four dossier screenshots (JPEG, 1280×720).

## Screenshots

```sh
node capture.mjs            # serves game/, captures shots.json into screenshots/
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # builds out/dossier.json
```
