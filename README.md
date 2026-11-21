# Port Verona — a top-down open-world crime game

An original, browser-playable open-world crime game in the spirit of the classic
top-down GTA games, built as plain static files (HTML5 canvas 2D, ES modules, no
libraries, no network requests). Entry for the make.fun gta6-01 bounty.

Everything — city, characters, vehicles, story, art and sound — is original and
generated at runtime: no assets from Rockstar Games or any commercial game.

## Play it

```bash
node serve.ts            # serves game/ at http://localhost:8080
```

Open the page in a desktop browser. Or serve `game/` with any static file server
and open `game/index.html`. No build step, no install, nothing loads over the
network.

## The game

You are **Nicky Vale**, newly arrived in **Port Verona**, a sun-soaked coastal
city of pastel blocks, named streets, parks and a beach district. Fixer **Mara
Delgado** and crew boss **Sal Okafor** have work for you — six missions that run
from a first driving favor to a full heist getaway, opposed by the rival Kestrel
crew and the Port Verona police.

- **Open city** — a seeded, deterministic grid city (2640×1920) with named
  streets, varied buildings, parks, plazas, landmarks (hospital, police station,
  casino, radio tower) and a beach with water at the south edge.
- **On foot and by car** — walk with WASD; press **E** near any traffic or
  parked car to steal it (the driver flees — and it's a crime). Momentum-based
  driving with speed-scaled steering, handbrake (Space), building and car
  collisions; press **E** again to step out.
- **Living city** — traffic cars drive the street grid node by node and stop for
  obstacles; pedestrians wander the sidewalks and flee from gunfire and bad
  driving.
- **Wanted level** — stealing cars, shooting civilians, hitting cars and killing
  cops raise a 1–5 star wanted level. Police cars spawn from the station, chase
  you through the grid, brake alongside you and drop cops on foot who pursue and
  shoot. Stay clean for a while and the heat cools off.
- **Missions and story** — six story missions with named characters: a tutorial
  drive, a package run, taking out Kestrel shooters, escorting Sal's cousin
  Didi, surviving a 60-second wanted storm, and the finale heist. Rewards are
  money; progress is auto-saved.
- **Combat** — fists (**F**) and a pistol (mouse aim, click to fire, **1**/**2**
  to switch). Pedestrians, rivals and cops have health; death wakes you up in
  the hospital with 15% of your cash gone.
- **HUD** — health bar, wanted stars, money, current mission text, a live
  minimap (roads, water, cars, police, mission marker, player heading), a
  speedometer while driving, and contextual controls.
- **Polish** — a day/night cycle with car headlights, lit windows, street lights
  and neon; WebAudio-synthesized engine, siren, gunshot and explosion sounds
  (no audio files); particles for blood, sparks, smoke and explosions; screen
  shake; smooth camera follow that zooms out in a car; a title screen with a
  slow city pan and **Continue** from your save; pause with **Esc**; mute with
  **M**.

### Controls

| Action | Keys |
|---|---|
| Move / drive | WASD or arrow keys |
| Aim | Mouse |
| Shoot | Left click |
| Punch / handbrake | F or Space |
| Enter / exit car | E |
| Switch weapon | 1 (fists) / 2 (pistol) |
| Pause | Esc or P |
| Mute | M |

## Screenshots

`screenshots/` holds four real renders of the game taken in headless Chrome via
the `?shot=<name>&seed=<n>` scene mechanism in `game/src/shots.js`:

1. `1-chase.png` — on foot at dusk, three-star wanted level, police closing in
   (cover)
2. `2-drive.png` — driving in morning traffic with the HUD and minimap
3. `3-night.png` — a night cruise past the beach district, headlights and lit
   windows
4. `4-start.png` — the title screen over a panning view of the city

## Repository layout

```
game/            the game: index.html + ES modules (plain canvas 2D, no libraries)
  src/main.js    boot, fixed-step game loop, screens, screenshot mode
  src/game.js    shared state and the one simulation step
  src/city.js    seeded city generation, roads, buildings, collision
  src/entities.js  player, cars, peds, cops, bullets, particles, car physics
  src/ai.js      traffic, pedestrian and police AI
  src/missions.js  the six-mission story runner
  src/render.js  camera, world rendering, day/night, particles
  src/hud.js     HUD and minimap
  src/audio.js   WebAudio-synthesized sound
  src/input.js   keyboard and mouse
  src/save.js    localStorage save
  src/shots.js   the screenshot scenes
  src/config.js  shared constants
  src/rng.js     seeded RNG
main.ts          entry program: copies game/ and screenshots/ to /output,
                 writes dossier.json via vendor/makefun-game.ts
serve.ts         tiny static server for local play
vendor/          the kit's make.fun library (unchanged)
```

## Hand it in

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` into `out/` and writes `out/dossier.json`
with `buildDossier` from `vendor/makefun-game.ts`.

## License

MIT (see `LICENSE`). All game content is original.
