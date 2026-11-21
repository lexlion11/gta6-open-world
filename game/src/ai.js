// AI for the living city: traffic cars drive the street grid node by node and stop
// for obstacles, pedestrians wander the sidewalks and flee from gunfire and bad
// driving, police cars navigate toward the player and drop cops on foot who chase
// and shoot. All of it reads and mutates the shared game state.
import { COLS, POLICE, ROWS, TILE, TRAFFIC, WANTED } from './config.js';
import { between, pickInt } from './rng.js';
import { makeCar, makeCop, makePed, separateCars, stepCar } from './entities.js';

/** Drive one traffic car along the node graph, stopping for cars and pedestrians. */
function stepTrafficCar(car, game, dt) {
  const city = game.city;
  const target = city.lanePoint(car.toI, car.toJ, car.dirX, car.dirY);
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);

  // Obstacle look-ahead: any car or pedestrian within this cone ahead slows us.
  let blocked = false;
  const fx = car.dirX;
  const fy = car.dirY;
  const others = game.cars;
  for (let k = 0; k < others.length; k += 1) {
    const o = others[k];
    if (o === car || o.wreck) continue;
    const ox = o.x - car.x;
    const oy = o.y - car.y;
    const ahead = ox * fx + oy * fy;
    const side = Math.abs(-ox * fy + oy * fx);
    if (ahead > 0 && ahead < 64 && side < 20) { blocked = true; break; }
  }
  if (!blocked) {
    for (let k = 0; k < game.peds.length; k += 1) {
      const p = game.peds[k];
      if (p.state === 'dead') continue;
      const ox = p.x - car.x;
      const oy = p.y - car.y;
      const ahead = ox * fx + oy * fy;
      const side = Math.abs(-ox * fy + oy * fx);
      if (ahead > 0 && ahead < 44 && side < 16) { blocked = true; break; }
    }
  }

  car.targetSpeed = blocked ? 0 : TRAFFIC.cruise * (0.7 + 0.3 * ((car.seed ?? 0) % 10) / 10);
  // Smooth speed toward target.
  const rate = blocked ? 240 : 160;
  if (car.speed > car.targetSpeed) car.speed = Math.max(car.targetSpeed, car.speed - rate * dt);
  else car.speed = Math.min(car.targetSpeed, car.speed + rate * dt);

  // Steer toward the lane target; near the node, pick the next edge.
  const desired = Math.atan2(dy, dx);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));

  const out = {};
  stepCar(car, dt, { throttle: 0, brake: 0, steer: 0 }, city, out);

  if (dist < 14) {
    // Arrived at the intersection: choose the next node, never reversing unless stuck.
    const options = city.neighbors(car.toI, car.toJ).filter(([ni, nj]) =>
      !(ni === car.fromI && nj === car.fromJ));
    const pool = options.length ? options : [[car.fromI, car.fromJ]];
    // Weight toward straight-ahead when possible, for believable traffic flow.
    const straight = pool.find(([ni, nj]) =>
      ni === car.toI + car.dirX && nj === car.toJ + car.dirY);
    let next;
    if (straight && Math.random() < 0.62) next = straight;
    else next = pool[Math.floor(Math.random() * pool.length)];
    car.fromI = car.toI;
    car.fromJ = car.toJ;
    car.toI = next[0];
    car.toJ = next[1];
    car.dirX = Math.sign(next[0] - car.fromI);
    car.dirY = Math.sign(next[1] - car.fromJ);
    if (car.dirX === 0 && car.dirY === 0) car.dirX = 1;
  }
}

/** Wander one pedestrian along the block edges; flee from nearby violence. */
function stepPed(ped, game, dt) {
  if (ped.state === 'dead') return;
  if (ped.state === 'ally') {
    // Follow the player closely, on foot or riding along invisibly.
    const pl = game.player;
    if (pl.inCar) return;
    const dx = pl.x - ped.x;
    const dy = pl.y - ped.y;
    const d = Math.hypot(dx, dy);
    if (d > 26) {
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * TRAFFIC.pedSpeed * 1.15 * dt;
      ped.y += (dy / d) * TRAFFIC.pedSpeed * 1.15 * dt;
    }
    return;
  }
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0) {
      ped.state = 'walk';
      pickPedTarget(ped, game);
    } else {
      ped.x += Math.cos(ped.angle) * TRAFFIC.pedRun * dt;
      ped.y += Math.sin(ped.angle) * TRAFFIC.pedRun * dt;
    }
  } else {
    // Threat awareness: gunshots, a fast car, or the player aiming nearby.
    const threat = nearestThreat(ped, game);
    if (threat) {
      ped.state = 'flee';
      ped.fleeTimer = between(game.rng, 1.6, 3.4);
      ped.angle = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      game.sound?.hit();
      return;
    }
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    if (Math.hypot(dx, dy) < 8) {
      pickPedTarget(ped, game);
    } else {
      ped.angle = Math.atan2(dy, dx);
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
    }
  }
  // Keep pedestrians out of buildings.
  const out = {};
  const res = game.city.collideCircle(ped.x, ped.y, 7, out);
  ped.x = res.x;
  ped.y = res.y;
}

function pickPedTarget(ped, game) {
  // Walk along the sidewalk: pick a point ahead on the current street or around the corner.
  const ahead = between(game.rng, 60, 180);
  const wander = between(game.rng, -0.5, 0.5);
  const tx = ped.x + Math.cos(ped.angle) * ahead + Math.cos(ped.angle + Math.PI / 2) * wander * ahead;
  const ty = ped.y + Math.sin(ped.angle) * ahead + Math.sin(ped.angle + Math.PI / 2) * wander * ahead;
  const out = {};
  const res = game.city.collideCircle(tx, ty, 7, out);
  if (out.impact > 8) {
    ped.angle += between(game.rng, 1.2, 2.4) * (game.rng() < 0.5 ? 1 : -1);
  } else {
    ped.targetX = res.x;
    ped.targetY = res.y;
  }
}

function nearestThreat(ped, game) {
  // Recent gunfire is remembered as a hot zone in game.shotNoise.
  for (let k = 0; k < game.shotNoise.length; k += 1) {
    const s = game.shotNoise[k];
    if (Math.hypot(s.x - ped.x, s.y - ped.y) < 170) return s;
  }
  // A car bearing down at speed.
  for (let k = 0; k < game.cars.length; k += 1) {
    const c = game.cars[k];
    if (Math.abs(c.speed) < 110 || c.wreck) continue;
    if (Math.hypot(c.x - ped.x, c.y - ped.y) < 90) return c;
  }
  return null;
}

/** Police car: navigate the grid toward the player, then close in and drop cops. */
function stepPoliceCar(car, game, dt) {
  if (car.wreck) {
    car.wreckTimer -= dt;
    car.speed *= 0.9;
    const out = {};
    stepCar(car, dt, { throttle: 0, brake: 0, steer: 0 }, game.city, out);
    return;
  }
  const pl = game.player;
  const dist = Math.hypot(pl.x - car.x, pl.y - car.y);
  const city = game.city;

  if (dist > 190) {
    // En route: drive the node graph, always toward the player.
    const target = city.lanePoint(car.toI, car.toJ, car.dirX, car.dirY);
    if (Math.hypot(target.x - car.x, target.y - car.y) < 16) {
      const options = city.neighbors(car.toI, car.toJ).filter(([ni, nj]) =>
        !(ni === car.fromI && nj === car.fromJ));
      const pool = options.length ? options : [[car.fromI, car.fromJ]];
      let best = pool[0];
      let bestD = Infinity;
      for (let k = 0; k < pool.length; k += 1) {
        const d = Math.hypot((pool[k][0] * TILE) - pl.x, (pool[k][1] * TILE) - pl.y);
        if (d < bestD) { bestD = d; best = pool[k]; }
      }
      car.fromI = car.toI;
      car.fromJ = car.toJ;
      car.toI = best[0];
      car.toJ = best[1];
      car.dirX = Math.sign(best[0] - car.fromI);
      car.dirY = Math.sign(best[1] - car.fromJ);
      if (car.dirX === 0 && car.dirY === 0) car.dirX = 1;
    }
    const tx = city.lanePoint(car.toI, car.toJ, car.dirX, car.dirY);
    const desired = Math.atan2(tx.y - car.y, tx.x - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-3.0 * dt, Math.min(3.0 * dt, diff));
    car.speed = Math.min(car.maxSpeed, car.speed + 200 * dt);
  } else {
    // Close: seek the player directly, and brake alongside them to drop cops.
    const desired = Math.atan2(pl.y - car.y, pl.x - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
    if (dist < 140) {
      car.speed = Math.max(24, car.speed - 420 * dt);
    } else {
      car.speed = Math.min(car.maxSpeed, car.speed + 260 * dt);
    }
    // Drop cops when alongside and slow enough.
    if (dist < 110 && Math.abs(car.speed) < 95 && car.copsDropped < 2 && game.cops.length < POLICE.maxCops) {
      car.copsDropped += 1;
      const cop = makeCop(car.x + between(game.rng, -20, 20), car.y + between(game.rng, -20, 20));
      game.cops.push(cop);
      game.sound?.sirenStart();
    }
  }

  const out = {};
  stepCar(car, dt, { throttle: 0, brake: 0, steer: 0 }, city, out);
  if (out.crash) game.shake = Math.max(game.shake, out.crash / 220);
}

/** A cop on foot: chase the player and fire when in range. */
function stepCop(cop, game, dt) {
  const pl = game.player;
  const dx = pl.x - cop.x;
  const dy = pl.y - cop.y;
  const dist = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  if (dist > 34) {
    cop.x += (dx / dist) * POLICE.copSpeed * dt;
    cop.y += (dy / dist) * POLICE.copSpeed * dt;
  }
  const out = {};
  const res = game.city.collideCircle(cop.x, cop.y, 8, out);
  cop.x = res.x;
  cop.y = res.y;

  cop.fireTimer -= dt;
  if (cop.fireTimer <= 0 && dist < POLICE.copRange && !pl.dead && pl.invuln <= 0) {
    cop.fireTimer = POLICE.copFireRate;
    const spread = between(game.rng, -0.09, 0.09);
    const angle = cop.angle + spread;
    game.bullets.push({
      x: cop.x + Math.cos(angle) * 12,
      y: cop.y + Math.sin(angle) * 12,
      vx: Math.cos(angle) * POLICE.bulletSpeed,
      vy: Math.sin(angle) * POLICE.bulletSpeed,
      life: 0.8,
      owner: 'police',
      damage: POLICE.bulletDamage,
    });
    game.shotNoise.push({ x: cop.x, y: cop.y, t: 0 });
    game.sound?.policeShot();
  }
}

// ---- spawners -----------------------------------------------------------

export function spawnTraffic(game) {
  const p = game.city.randomLanePoint(game.rng);
  const car = makeCar(game.rng, p.x, p.y, p.dx, p.dy, 'traffic');
  car.driver = 'ai';
  const [fi, fj] = game.city.nearestNode(p.x, p.y);
  car.fromI = fi;
  car.fromJ = fj;
  // Head toward the direction of travel's next node.
  car.toI = Math.max(0, Math.min(COLS, fi + (p.dx || 0)));
  car.toJ = Math.max(0, Math.min(ROWS, fj + (p.dy || 0)));
  if (car.toI === car.fromI && car.toJ === car.fromJ) car.toI = Math.min(COLS, fi + 1);
  car.dirX = Math.sign(car.toI - car.fromI) || p.dx;
  car.dirY = Math.sign(car.toJ - car.fromJ) || p.dy;
  car.seed = pickInt(game.rng, 0, 9);
  game.cars.push(car);
}

export function spawnPed(game) {
  const p = game.city.randomSidewalkPoint(game.rng);
  const ped = makePed(game.rng, p.x, p.y);
  ped.targetX = p.x;
  ped.targetY = p.y;
  game.peds.push(ped);
}

export function spawnPoliceCar(game) {
  const city = game.city;
  let p;
  if (city.policeStation && Math.random() < 0.6) {
    p = { x: city.policeStation.x, y: city.policeStation.y - 40, dx: 1, dy: 0 };
  } else {
    p = city.randomLanePoint(game.rng);
  }
  const car = makeCar(game.rng, p.x, p.y, p.dx || 1, p.dy, 'police');
  car.driver = 'ai';
  const [fi, fj] = city.nearestNode(p.x, p.y);
  car.fromI = fi;
  car.fromJ = fj;
  car.toI = Math.max(0, Math.min(COLS, fi + (p.dx || 1)));
  car.toJ = Math.max(0, Math.min(ROWS, fj + (p.dy || 0)));
  car.dirX = Math.sign(car.toI - car.fromI) || 1;
  car.dirY = Math.sign(car.toJ - car.fromJ);
  game.cars.push(car);
}

// ---- per-frame system entry points --------------------------------------

export function stepTrafficSystem(game, dt) {
  for (let k = 0; k < game.cars.length; k += 1) {
    const car = game.cars[k];
    if (car.driver === 'ai' && (car.kind === 'traffic' || car.kind === 'police')) {
      if (car.kind === 'traffic') stepTrafficCar(car, game, dt);
      else stepPoliceCar(car, game, dt);
    }
  }
  // Car-on-car bumps.
  for (let a = 0; a < game.cars.length; a += 1) {
    for (let b = a + 1; b < game.cars.length; b += 1) {
      if (separateCars(game.cars[a], game.cars[b])) {
        const speed = Math.max(Math.abs(game.cars[a].speed), Math.abs(game.cars[b].speed));
        if (speed > 140) {
          game.shake = Math.max(game.shake, speed / 500);
          game.sound?.crash(Math.min(1, speed / 300));
          if (game.cars[a].kind === 'police' || game.cars[b].kind === 'police') {
            game.addHeat(WANTED.hitCar);
          } else if (game.cars[a] === game.player.inCar || game.cars[b] === game.player.inCar) {
            game.addHeat(WANTED.hitCar);
          }
        }
      }
    }
  }
}

export function stepPedSystem(game, dt) {
  for (let k = 0; k < game.peds.length; k += 1) stepPed(game.peds[k], game, dt);
}

export function stepPoliceSystem(game, dt) {
  for (let k = 0; k < game.cops.length; k += 1) stepCop(game.cops[k], game, dt);
}
