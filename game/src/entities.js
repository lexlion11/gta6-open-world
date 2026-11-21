// Entity factories and vehicle physics: the player, traffic cars, police cars,
// pedestrians, cops on foot, bullets and particles. Cars share one simple
// momentum model (throttle, brake, speed-scaled steering) with building collision.
import { CAR, POLICE, TRAFFIC, WORLD_H, WORLD_W } from './config.js';
import { between, pickFrom, pickInt } from './rng.js';

const CAR_COLORS = ['#c94f4f', '#4f7fc9', '#e0b84a', '#5aa05a', '#8a6fd8', '#d8703c', '#c0c8d0', '#4a5a6a', '#b03a6a', '#3aa0a0'];
const PED_SHIRTS = ['#d85a4a', '#4a7ad8', '#5aa05a', '#d8a03c', '#9a5ad8', '#4ac0c0', '#d84a8a', '#e0e0e0', '#8a8a8a', '#c9703c'];
const PED_PANTS = ['#2c2f3a', '#3a3f4a', '#4a3a2f', '#2f3a4a', '#3a2f3a'];

export function makeCar(rng, x, y, dx, dy, kind = 'traffic') {
  const angle = Math.atan2(dy, dx);
  return {
    kind,                       // 'traffic' | 'police' | 'player'
    x, y, angle,
    speed: kind === 'traffic' ? between(rng, 60, TRAFFIC.cruise) : 0,
    targetSpeed: TRAFFIC.cruise,
    maxSpeed: kind === 'police' ? POLICE.carSpeed : CAR.maxSpeed,
    width: CAR.width,
    length: CAR.length,
    radius: CAR.radius,
    color: kind === 'police' ? '#3a5a8a' : pickFrom(rng, CAR_COLORS),
    roof: kind === 'police' ? '#d8e2f0' : null,
    hp: kind === 'police' ? POLICE.carHp : CAR.hp,
    driver: null,               // 'player' | 'ai' | null
    // traffic AI state
    fromI: 0, fromJ: 0, toI: 0, toJ: 0,
    dirX: dx, dirY: dy,
    stopped: false,
    // police state
    copsDropped: 0,
    wreck: false,
    wreckTimer: 0,
  };
}

export function makePed(rng, x, y) {
  return {
    kind: 'ped',
    x, y,
    angle: between(rng, 0, Math.PI * 2),
    speed: TRAFFIC.pedSpeed,
    state: 'walk',              // 'walk' | 'flee' | 'dead' | 'ally'
    health: 42,
    shirt: pickFrom(rng, PED_SHIRTS),
    pants: pickFrom(rng, PED_PANTS),
    skin: pickFrom(rng, ['#e8c8a8', '#c8a878', '#a8784a', '#d8b898']),
    fleeTimer: 0,
    walkTimer: between(rng, 2, 6),
    targetX: x,
    targetY: y,
    money: pickInt(rng, 0, 40),
  };
}

export function makeCop(x, y) {
  return {
    kind: 'cop',
    x, y,
    angle: 0,
    speed: POLICE.copSpeed,
    state: 'chase',
    health: POLICE.copHp,
    fireTimer: between(Math.random, 0.3, POLICE.copFireRate),
  };
}

export function makeBullet(x, y, angle, owner, speed, damage, life) {
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    owner,                      // 'player' | 'police'
    damage,
  };
}

export function makeParticle(x, y, vx, vy, life, color, size, kind = 'spark') {
  return { x, y, vx, vy, life, maxLife: life, color, size, kind };
}

export function makePlayer(x, y) {
  return {
    kind: 'player',
    x, y,
    angle: -Math.PI / 2,
    radius: 9,
    health: 100,
    maxHealth: 100,
    money: 0,
    inCar: null,
    weapon: 'pistol',
    fireTimer: 0,
    punchTimer: 0,
    invuln: 0,
    dead: false,
    deadTimer: 0,
    shirt: '#3a6ea8',
    pants: '#23283a',
    skin: '#e8c8a8',
  };
}

/**
 * Step a car one tick under player or AI control. input is {throttle, brake, steer}
 * for the player; AI drives by setting speed/targetSpeed and angle directly, so it
 * calls this with steer 0 and uses the same collision code.
 */
export function stepCar(car, dt, input, city, out) {
  if (car.wreck) {
    car.wreckTimer -= dt;
    car.speed *= 0.92;
    moveCar(car, dt);
    return;
  }
  const { throttle, brake, steer } = input;
  if (throttle) car.speed += CAR.accel * dt;
  else if (brake) car.speed -= CAR.brake * dt;
  else {
    // engine braking toward 0
    const eb = CAR.engineBrake * dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - eb);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + eb);
  }
  const maxFwd = car.maxSpeed;
  const maxRev = -CAR.reverseSpeed;
  if (car.speed > maxFwd) car.speed = maxFwd;
  if (car.speed < maxRev) car.speed = maxRev;

  // Steering scales with speed: no turning when parked, full at speed.
  const speedFactor = Math.min(1, Math.abs(car.speed) / 70);
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += steer * CAR.turn * speedFactor * dir * dt;

  moveCar(car, dt);

  // Building collision: push out, bleed speed, report impact for shake/sound.
  const res = city.collideCircle(car.x, car.y, car.radius, out);
  const impact = out.impact ?? 0;
  if (impact > 0.5) {
    car.x = res.x;
    car.y = res.y;
    const bleed = Math.min(0.85, impact / 40);
    const before = car.speed;
    car.speed *= 1 - bleed;
    out.crash = Math.max(out.crash ?? 0, Math.abs(before) * bleed);
  }
}

function moveCar(car, dt) {
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = Math.max(8, Math.min(WORLD_W - 8, car.x));
  car.y = Math.max(8, Math.min(WORLD_H - 8, car.y));
}

/** Circle-vs-circle separation for car-on-car bumps; returns true if they touched. */
export function separateCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const min = a.radius + b.radius;
  if (d2 >= min * min || d2 < 0.0001) return false;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  // Exchange a little momentum along the normal.
  const av = a.speed * (Math.cos(a.angle) * nx + Math.sin(a.angle) * ny);
  const bv = b.speed * (Math.cos(b.angle) * nx + Math.sin(b.angle) * ny);
  const transfer = (bv - av) * 0.35;
  a.speed += transfer;
  b.speed -= transfer;
  return true;
}
