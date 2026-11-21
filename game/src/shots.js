// The screenshot scenes behind ?shot=start|drive|chase|night&seed=N. Each one sets
// up a deterministic slice of the real game (time of day, wanted level, traffic,
// police) and plays the actual simulation forward with a scripted pilot, so the
// frame is what the game really looks like and the same seed gives the same frame.
import { STEP, TILE } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './game.js';
import { spawnPoliceCar, spawnTraffic } from './ai.js';
import { makeCar } from './entities.js';

/** Put the player in a car on a long straight avenue, in morning light. */
function stageDrive(game) {
  game.renderer.time = 0.28;
  const pl = game.player;
  pl.x = 2 * TILE + 12;
  pl.y = 4 * TILE;
  const car = makeCar(game.rng, pl.x, pl.y, 1, 0, 'traffic');
  car.kind = 'player';
  car.color = '#c94f4f';
  car.driver = 'player';
  car.speed = 120;
  car.angle = 0;
  game.cars.push(car);
  pl.inCar = car;
  game.sound.enabled = false;
  for (let k = 0; k < 5; k += 1) spawnTraffic(game);
  // Drive east along the avenue, steering toward a point ahead on the lane center.
  for (let i = 0; i < 4.5 / STEP; i += 1) {
    const input = game.input;
    const center = 4 * TILE + 12;
    const desired = Math.atan2(center - car.y, car.x + 400 - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-0.7, Math.min(0.7, diff));
    const keys = ['up'];
    if (steer > 0.06) keys.push('right');
    else if (steer < -0.06) keys.push('left');
    input.keys = new Set(keys);
    game.step(STEP, input.consume());
  }
}

/** On foot at dusk with a three-star wanted level, police closing in, shooting back. */
function stageChase(game) {
  game.renderer.time = 0.76;
  const pl = game.player;
  pl.x = 5 * TILE;
  pl.y = 3 * TILE;
  pl.weapon = 'pistol';
  game.setWanted(3);
  for (let k = 0; k < 3; k += 1) {
    spawnPoliceCar(game);
    const c = game.cars[game.cars.length - 1];
    // Place them on the horizontal road beside the player, never inside a block.
    c.x = pl.x + (k - 1) * 150;
    c.y = 3 * TILE + 12;
    c.angle = 0;
    c.speed = 80;
    c.fromI = Math.round(c.x / TILE);
    c.fromJ = 3;
    c.toI = Math.max(0, Math.min(11, c.fromI + 1));
    c.toJ = 3;
    c.dirX = 1;
    c.dirY = 0;
  }
  game.sound.enabled = false;
  const total = 5.5 / STEP;
  for (let i = 0; i < total; i += 1) {
    const input = game.input;
    // Aim at the nearest cop or police car and fire early on, then hold fire so
    // the pursuers close in and the frame shows the chase.
    let target = game.cops[0];
    if (!target) {
      for (const c of game.cars) {
        if (c.kind === 'police' && !c.wreck) { target = c; break; }
      }
    }
    if (target) {
      const cam = game.renderer.camera;
      const sx = (target.x - cam.x + cam.shakeX) * cam.zoom + game.canvas.width / 2 / (game.renderer.dpr || 1);
      const sy = (target.y - cam.y + cam.shakeY) * cam.zoom + game.canvas.height / 2 / (game.renderer.dpr || 1);
      input.mouseX = sx;
      input.mouseY = sy;
    }
    input.keys = new Set(['down', 'left']);
    input.fired = i < total * 0.35;
    game.step(STEP, input.consume());
  }
}

/** Night cruise: headlights, lit windows and neon along the beach route. */
function stageNight(game) {
  game.renderer.time = 0.86;
  const pl = game.player;
  pl.x = 8 * TILE + 12;
  pl.y = 260;
  const car = makeCar(game.rng, pl.x, pl.y, 0, 1, 'traffic');
  car.kind = 'player';
  car.color = '#2a3a5a';
  car.driver = 'player';
  car.speed = 140;
  car.angle = Math.PI / 2;
  game.cars.push(car);
  pl.inCar = car;
  game.sound.enabled = false;
  for (let k = 0; k < 4; k += 1) spawnTraffic(game);
  for (let i = 0; i < 4 / STEP; i += 1) {
    const input = game.input;
    const center = 8 * TILE + 12;
    const desired = Math.atan2(car.y + 400 - car.y, center - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-0.7, Math.min(0.7, diff));
    const keys = ['up'];
    if (steer > 0.06) keys.push('right');
    else if (steer < -0.06) keys.push('left');
    input.keys = new Set(keys);
    game.step(STEP, input.consume());
  }
}

/**
 * Set `game` to the named scene (start, drive, chase, night; any other name is
 * start) and run its scripted seconds forward. Returns the screen to draw.
 */
export function stageShot(name, game) {
  game.populate();
  if (name === 'drive') { game.screen = SCREEN_PLAY; stageDrive(game); }
  else if (name === 'chase') { game.screen = SCREEN_PLAY; stageChase(game); }
  else if (name === 'night') { game.screen = SCREEN_PLAY; stageNight(game); }
  else { game.screen = SCREEN_TITLE; }
  return game.screen;
}
