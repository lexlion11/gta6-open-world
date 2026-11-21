// The game itself: shared state (city, player, traffic, police, bullets, particles,
// missions, sound, wanted heat) and one fixed simulation step that wires every
// system together — movement, driving, combat, AI, spawning, day/night, saves.
import { DAY_MINUTES, PLAYER, POLICE, STEP, TRAFFIC, WANTED, WEAPONS, WORLD_H, WORLD_W } from './config.js';
import { City } from './city.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Renderer } from './render.js';
import { MissionRunner } from './missions.js';
import { makeBullet, makeCar, makeParticle, makePed, makePlayer, separateCars, stepCar } from './entities.js';
import { spawnPed, spawnPoliceCar, spawnTraffic, stepPedSystem, stepPoliceSystem, stepTrafficSystem } from './ai.js';
import { clearSave, loadSave, saveGame } from './save.js';
import { between, makeRng, pickInt } from './rng.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

export class Game {
  constructor(canvas, seed) {
    this.canvas = canvas;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.city = new City(seed);
    this.renderer = new Renderer(canvas);
    this.renderer.resize();
    this.hud = new Hud();
    this.sound = new Sound();
    this.input = new Input(canvas);
    this.missions = new MissionRunner(this);
    this.screen = SCREEN_TITLE;
    this.hasSave = !!loadSave();

    this.player = makePlayer(WORLD_W / 2, 120);
    this.cars = [];
    this.peds = [];
    this.cops = [];
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.shotNoise = [];
    this.inventory = [];
    this.ally = null;

    this.heat = 0;
    this.crimeTimer = 0;
    this.heatLocked = false;
    this.policeSpawnTimer = 4;
    this.trafficTimer = 0;
    this.pedTimer = 0;
    this.saveTimer = 0;
    this.shake = 0;
    this.aimAngle = -Math.PI / 2;
    this.muted = false;
    this.elapsed = 0;
    this.populated = false;
  }

  // ---- lifecycle ---------------------------------------------------------

  /** Seed the world with traffic and pedestrians once, around the player. */
  populate() {
    if (this.populated) return;
    this.populated = true;
    for (let k = 0; k < 10; k += 1) spawnTraffic(this);
    for (let k = 0; k < 14; k += 1) spawnPed(this);
  }

  /** Start a new game (a fresh story, clearing any save). */
  newGame() {
    clearSave();
    this.hasSave = false;
    this.player.x = WORLD_W / 2;
    this.player.y = 140;
    this.missions.startAt(0);
    this.missions.beginNext();
    this.populate();
    this.screen = SCREEN_PLAY;
    this.sound.start();
  }

  /** Continue from the save slot. */
  continueGame() {
    const save = loadSave();
    if (save) this.loadState(save);
    this.populate();
    this.screen = SCREEN_PLAY;
    this.sound.start();
  }

  loadState(save) {
    const pl = this.player;
    pl.x = save.x;
    pl.y = save.y;
    pl.health = save.health;
    pl.money = save.money;
    pl.weapon = save.weapon ?? 'pistol';
    this.heat = save.heat ?? 0;
    this.inventory = save.inventory ?? [];
    this.renderer.time = save.time ?? 0.3;
    this.missions.index = save.missionIndex - 1;
    if (save.missionActive) this.missions.beginNext();
    else if (save.missionIndex < 6) {
      // The next giver calls back shortly after loading in.
      this.missions.pendingNext = 6;
      this.missions.showFlash('New job', 'Mara is on the line. Sit tight — the details are coming.');
    }
  }

  toTitle() {
    this.screen = SCREEN_TITLE;
    this.sound.engineStop();
    this.sound.sirenStop();
  }

  // ---- wanted level ------------------------------------------------------

  stars() {
    let s = 0;
    for (let k = 1; k < WANTED.starAt.length; k += 1) {
      if (this.heat >= WANTED.starAt[k]) s = k;
    }
    return s;
  }

  addHeat(amount) {
    if (this.heatLocked && amount > 0) {
      // During the survive mission the heat is pinned, crimes just refresh the clock.
      this.crimeTimer = 0;
      return;
    }
    this.heat = Math.min(160, this.heat + amount);
    this.crimeTimer = 0;
  }

  setWanted(stars) {
    this.heat = WANTED.starAt[stars] ?? 0;
    this.crimeTimer = 0;
  }

  // ---- helpers -----------------------------------------------------------

  nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.cars) {
      if (c === this.player.inCar || c.wreck) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  spawnExplosion(x, y) {
    for (let k = 0; k < 26; k += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = between(Math.random, 30, 190);
      this.particles.push(makeParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, between(Math.random, 0.3, 0.8), '#ffce6a', between(Math.random, 3, 8), 'explosion'));
    }
    for (let k = 0; k < 10; k += 1) {
      this.particles.push(makeParticle(x + between(Math.random, -14, 14), y + between(Math.random, -14, 14), between(Math.random, -20, 20), between(Math.random, -40, -10), between(Math.random, 0.8, 1.6), '#666', between(Math.random, 6, 12), 'smoke'));
    }
    this.shake = Math.max(this.shake, 0.9);
    this.sound.explosion();
  }

  spawnBlood(x, y) {
    for (let k = 0; k < 10; k += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = between(Math.random, 20, 110);
      this.particles.push(makeParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, between(Math.random, 0.25, 0.6), '#a02828', between(Math.random, 2, 5), 'blood'));
    }
  }

  spawnSparks(x, y) {
    for (let k = 0; k < 6; k += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = between(Math.random, 60, 160);
      this.particles.push(makeParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, between(Math.random, 0.15, 0.35), '#ffce6a', 2, 'spark'));
    }
  }

  onMissionComplete() {
    saveGame(this);
    this.hasSave = true;
  }

  // ---- the step ----------------------------------------------------------

  step(dt, actions) {
    if (this.screen !== SCREEN_PLAY) return;
    this.elapsed += dt;
    const pl = this.player;
    const input = this.input;

    // Aim angle from player to cursor (world space).
    const mouseWorld = this.renderer.camera.screenToWorld(input.mouseX, input.mouseY, this.canvas);
    this.aimAngle = Math.atan2(mouseWorld.y - pl.y, mouseWorld.x - pl.x);

    this.stepPlayer(dt, actions);
    stepTrafficSystem(this, dt);
    stepPedSystem(this, dt);
    stepPoliceSystem(this, dt);
    this.stepEnemies(dt);
    this.stepBullets(dt);
    this.stepParticles(dt);
    this.stepWanted(dt);
    this.stepSpawners(dt);
    this.missions.update(dt);
    this.stepDayNight(dt);
    this.stepAudio(dt);
    this.stepCamera(dt);
    this.stepSave(dt);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.renderer.camera.applyShake(this.shake * 14);
    }
  }

  stepPlayer(dt, actions) {
    const pl = this.player;
    const input = this.input;
    const city = this.city;

    if (pl.dead) {
      pl.deadTimer -= dt;
      if (pl.deadTimer <= 0) this.respawn();
      return;
    }
    if (pl.invuln > 0) pl.invuln -= dt;

    if (pl.inCar) {
      const car = pl.inCar;
      const throttle = input.down('up') ? 1 : 0;
      const brake = input.down('down') ? 1 : 0;
      let steer = 0;
      if (input.down('left')) steer -= 1;
      if (input.down('right')) steer += 1;
      const handbrake = input.down('punch'); // space while driving = handbrake
      if (handbrake && Math.abs(car.speed) > 30) {
        car.speed *= Math.pow(0.06, dt);
        if (Math.random() < dt * 8) this.sound.screech();
      }
      const out = { crash: 0 };
      stepCar(car, dt, { throttle, brake, steer }, city, out);
      // The player rides along: keep the avatar position in sync for the minimap,
      // the exit placement and the save.
      pl.x = car.x;
      pl.y = car.y;
      if (out.crash > 40) {
        this.shake = Math.max(this.shake, out.crash / 260);
        this.sound.crash(Math.min(1, out.crash / 300));
        car.hp -= out.crash * 0.08;
        if (car.hp <= 0 && !car.wreck) this.destroyCar(car);
      }
      // Cars we run over.
      for (const ped of this.peds) {
        if (ped.state === 'dead' || ped.state === 'ally') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.radius + 8 && Math.abs(car.speed) > 90) {
          ped.state = 'dead';
          ped.angle = car.angle;
          this.spawnBlood(ped.x, ped.y);
          this.addHeat(WANTED.killPed);
          this.shake = Math.max(this.shake, 0.3);
        }
      }
      for (const enemy of this.enemies) {
        if (Math.hypot(enemy.x - car.x, enemy.y - car.y) < car.radius + 8 && Math.abs(car.speed) > 90) {
          enemy.health = 0;
        }
      }
      // Entering/exiting.
      if (actions.pressed.has('enter')) this.exitCar();
      this.sound.engineUpdate(Math.abs(car.speed) / car.maxSpeed);
      return;
    }

    // ---- on foot ----
    let mx = 0;
    let my = 0;
    if (input.down('up')) my -= 1;
    if (input.down('down')) my += 1;
    if (input.down('left')) mx -= 1;
    if (input.down('right')) mx += 1;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      pl.x += mx * PLAYER.speed * dt;
      pl.y += my * PLAYER.speed * dt;
    }
    const out = {};
    const res = city.collideCircle(pl.x, pl.y, pl.radius, out);
    pl.x = res.x;
    pl.y = res.y;
    pl.angle = this.aimAngle;

    // Enter a car.
    if (actions.pressed.has('enter')) {
      const car = this.nearestCar(pl.x, pl.y, 48);
      if (car) this.enterCar(car);
    }

    // Weapons.
    const weapon = WEAPONS[pl.weapon] ?? WEAPONS.pistol;
    if (pl.fireTimer > 0) pl.fireTimer -= dt;
    if (pl.punchTimer > 0) pl.punchTimer -= dt;

    if (pl.weapon === 'pistol' && actions.fired && pl.fireTimer <= 0) {
      pl.fireTimer = weapon.cooldown;
      const spread = between(this.rng, -weapon.spread, weapon.spread);
      const a = this.aimAngle + spread;
      const bx = pl.x + Math.cos(a) * 14;
      const by = pl.y + Math.sin(a) * 14;
      this.bullets.push(makeBullet(bx, by, a, 'player', weapon.bulletSpeed, weapon.damage, weapon.life));
      this.spawnSparks(bx, by);
      this.shotNoise.push({ x: bx, y: by, t: 0 });
      this.sound.gunshot();
      this.shake = Math.max(this.shake, 0.12);
      // Firing near civilians is a crime (disturbing the peace).
      this.addHeat(WANTED.shootNear);
    }

    if (actions.pressed.has('punch') && pl.punchTimer <= 0) {
      pl.punchTimer = weapon.cooldown;
      this.sound.punch();
      const hx = pl.x + Math.cos(this.aimAngle) * PLAYER.punchRange;
      const hy = pl.y + Math.sin(this.aimAngle) * PLAYER.punchRange;
      let hitSomething = false;
      const tryHit = (e, isCop) => {
        if (Math.hypot(e.x - hx, e.y - hy) < 18) {
          e.health -= PLAYER.punchDamage;
          this.spawnSparks(e.x, e.y);
          hitSomething = true;
          if (e.health <= 0) {
            if (isCop) { this.addHeat(WANTED.killCop); this.cops = this.cops.filter((c) => c !== e); }
          }
        }
      };
      for (const cop of this.cops) tryHit(cop, true);
      for (const enemy of this.enemies) tryHit(enemy, false);
      for (const ped of this.peds) {
        if (ped.state === 'dead' || ped.state === 'ally') continue;
        if (Math.hypot(ped.x - hx, ped.y - hy) < 18) {
          ped.state = 'flee';
          ped.fleeTimer = 3;
          ped.angle = Math.atan2(ped.y - pl.y, ped.x - pl.x);
          this.addHeat(4);
          hitSomething = true;
        }
      }
      if (hitSomething) this.sound.hit();
    }

    // Weapon switch.
    if (actions.pressed.has('weapon1')) pl.weapon = 'fist';
    if (actions.pressed.has('weapon2')) pl.weapon = 'pistol';
  }

  enterCar(car) {
    const pl = this.player;
    pl.inCar = car;
    car.driver = 'player';
    if (car.kind === 'traffic' || car.kind === 'police') {
      // Stealing: a driver flees (unless it's a wreck), and it's a crime.
      if (!car.wreck) {
        const driver = makePed(this.rng, car.x + 24, car.y + 16);
        driver.state = 'flee';
        driver.fleeTimer = 3;
        driver.angle = Math.atan2(driver.y - pl.y, driver.x - pl.x);
        this.peds.push(driver);
        this.addHeat(WANTED.stealCar);
        this.sound.crash(0.4);
      }
      if (car.kind === 'police') car.kind = 'player'; // repurposed
      else car.kind = 'player';
    }
    this.sound.engineStart();
  }

  exitCar() {
    const pl = this.player;
    const car = pl.inCar;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    // Step out to the left side of the car (away from traffic).
    pl.x = car.x - Math.sin(car.angle) * (car.width + 12);
    pl.y = car.y + Math.cos(car.angle) * (car.width + 12);
    const out = {};
    const res = this.city.collideCircle(pl.x, pl.y, pl.radius, out);
    pl.x = res.x;
    pl.y = res.y;
    pl.inCar = null;
    this.sound.engineStop();
    if (this.ally && this.ally.state === 'ally') {
      this.ally.x = pl.x + 20;
      this.ally.y = pl.y;
    }
  }

  destroyCar(car) {
    car.wreck = true;
    car.wreckTimer = 16;
    car.speed = 0;
    this.spawnExplosion(car.x, car.y);
    if (car === this.player.inCar) {
      this.player.health -= 35;
      this.exitCar();
    }
    if (car.kind === 'police') this.addHeat(WANTED.destroyPoliceCar);
  }

  respawn() {
    const pl = this.player;
    const h = this.city.hospital ?? { x: WORLD_W / 2, y: WORLD_H / 2 };
    if (pl.inCar) this.exitCar();
    pl.x = h.x + 30;
    pl.y = h.y + 40;
    pl.health = pl.maxHealth;
    pl.dead = false;
    pl.deadTimer = 0;
    pl.invuln = PLAYER.invulnTime;
    pl.money = Math.floor(pl.money * 0.85);
    this.heat = 0;
    this.cops = [];
    this.enemies = [];
    this.missions.hintShown = false;
    saveGame(this);
    this.missions.showFlash('Wasted', 'You woke up at Port Verona General. The doctors took their cut — 15% of your cash.');
  }

  stepEnemies(dt) {
    const pl = this.player;
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      const d = Math.hypot(pl.x - e.x, pl.y - e.y);
      // Keep distance, strafe, shoot.
      e.angle = Math.atan2(pl.y - e.y, pl.x - e.x);
      if (d > 220) {
        e.x += Math.cos(e.angle) * 90 * dt;
        e.y += Math.sin(e.angle) * 90 * dt;
      } else if (d < 140) {
        e.x -= Math.cos(e.angle) * 70 * dt;
        e.y -= Math.sin(e.angle) * 70 * dt;
      }
      const out = {};
      const res = this.city.collideCircle(e.x, e.y, 7, out);
      e.x = res.x;
      e.y = res.y;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && d < 380 && !pl.dead) {
        e.fireTimer = 1.3;
        const spread = between(this.rng, -0.07, 0.07);
        const a = e.angle + spread;
        this.bullets.push(makeBullet(e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, a, 'police', 560, 12, 0.9));
        this.shotNoise.push({ x: e.x, y: e.y, t: 0 });
        this.sound.policeShot();
      }
    }
    // Remove dead enemies and count kills.
    const before = this.enemies.length;
    this.enemies = this.enemies.filter((e) => e.health > 0);
    if (this.enemies.length < before) {
      this.missions.onEnemyKilled();
      this.sound.hit();
    }
  }

  stepBullets(dt) {
    const pl = this.player;
    const live = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (b.x < 0 || b.y < 0 || b.x > WORLD_W || b.y > WORLD_H) continue;
      // Building hit: sparks and stop.
      const out = {};
      const res = this.city.collideCircle(b.x, b.y, 2, out);
      if (out.impact > 0) {
        this.spawnSparks(res.x, res.y);
        continue;
      }
      let consumed = false;
      if (b.owner === 'player') {
        for (const cop of this.cops) {
          if (Math.hypot(cop.x - b.x, cop.y - b.y) < 10) {
            cop.health -= b.damage;
            this.spawnBlood(b.x, b.y);
            if (cop.health <= 0) {
              this.cops = this.cops.filter((c) => c !== cop);
              this.addHeat(WANTED.killCop);
              this.spawnBlood(cop.x, cop.y);
            }
            consumed = true;
            break;
          }
        }
        if (!consumed) {
          for (const e of this.enemies) {
            if (Math.hypot(e.x - b.x, e.y - b.y) < 10) {
              e.health -= b.damage;
              this.spawnBlood(b.x, b.y);
              consumed = true;
              break;
            }
          }
        }
        if (!consumed) {
          for (const ped of this.peds) {
            if (ped.state === 'dead' || ped.state === 'ally') continue;
            if (Math.hypot(ped.x - b.x, ped.y - b.y) < 10) {
              ped.health -= b.damage;
              this.spawnBlood(b.x, b.y);
              if (ped.health <= 0) {
                ped.state = 'dead';
                this.addHeat(WANTED.killPed);
              } else {
                ped.state = 'flee';
                ped.fleeTimer = 3;
                ped.angle = Math.atan2(ped.y - b.y, ped.x - b.x);
              }
              consumed = true;
              break;
            }
          }
        }
        if (!consumed) {
          for (const car of this.cars) {
            if (car.wreck) continue;
            if (Math.hypot(car.x - b.x, car.y - b.y) < car.radius) {
              car.hp -= b.damage * 0.5;
              this.spawnSparks(b.x, b.y);
              if (car.hp <= 0) this.destroyCar(car);
              consumed = true;
              break;
            }
          }
        }
      } else {
        // Police/enemy fire hits the player.
        if (!pl.dead && pl.invuln <= 0 && Math.hypot(pl.x - b.x, pl.y - b.y) < pl.radius + 2) {
          pl.health -= b.damage;
          this.spawnBlood(b.x, b.y);
          this.shake = Math.max(this.shake, 0.25);
          this.sound.hit();
          if (pl.health <= 0) {
            pl.dead = true;
            pl.deadTimer = 2.2;
            this.sound.explosion();
          }
          consumed = true;
        }
        // Bullets also hit cars the player isn't driving? Keep it simple: only the player.
      }
      if (!consumed) live.push(b);
    }
    this.bullets = live;

    // Decay shot noise (threat memory for pedestrians).
    for (const s of this.shotNoise) s.t += dt;
    this.shotNoise = this.shotNoise.filter((s) => s.t < 2.5);
  }

  stepParticles(dt) {
    const live = [];
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life > 0) live.push(p);
    }
    this.particles = live;
  }

  stepWanted(dt) {
    if (this.heatLocked) return;
    this.crimeTimer += dt;
    if (this.crimeTimer > WANTED.cooldown && this.heat > 0) {
      this.heat = Math.max(0, this.heat - WANTED.decay * dt);
    }
    // Clear pursuit when the heat is gone.
    if (this.heat <= 0 && this.cops.length) {
      this.cops = [];
    }
  }

  stepSpawners(dt) {
    const stars = this.stars();
    // Police.
    if (stars >= 1) {
      this.policeSpawnTimer -= dt;
      const policeCars = this.cars.filter((c) => c.kind === 'police' && !c.wreck).length;
      if (this.policeSpawnTimer <= 0 && policeCars < Math.min(POLICE.maxCars, 1 + stars)) {
        this.policeSpawnTimer = Math.max(2.5, 8 - stars * 1.2);
        spawnPoliceCar(this);
      }
    } else {
      // Retire remaining police when the heat is fully gone.
      this.cars = this.cars.filter((c) => !(c.kind === 'police' && !c.wreck && c.driver === 'ai' && Math.hypot(c.x - this.player.x, c.y - this.player.y) > 700));
      if (!this.cars.some((c) => c.kind === 'police' && !c.wreck)) this.cops = [];
    }
    // Traffic keeps flowing.
    this.trafficTimer -= dt;
    if (this.trafficTimer <= 0) {
      this.trafficTimer = between(this.rng, 1.2, 2.6);
      const live = this.cars.filter((c) => c.kind === 'traffic' && !c.wreck).length;
      if (live < TRAFFIC.maxCars) spawnTraffic(this);
      // Remove far-away traffic to respawn it nearer.
      this.cars = this.cars.filter((c) => {
        if (c.kind === 'traffic' && c.driver === 'ai' && Math.hypot(c.x - this.player.x, c.y - this.player.y) > 1300) return false;
        if (c.wreck && c.wreckTimer <= 0) return false;
        return true;
      });
    }
    // Pedestrians.
    this.pedTimer -= dt;
    if (this.pedTimer <= 0) {
      this.pedTimer = between(this.rng, 0.8, 2.0);
      const live = this.peds.filter((p) => p.state !== 'dead').length;
      if (live < TRAFFIC.maxPeds) spawnPed(this);
      // Clean up dead peds after a while and far-away ones.
      this.peds = this.peds.filter((p) => {
        if (p.state === 'ally' || p.state === 'allyWaiting') return true;
        if (p.state === 'dead') return Math.random() > 0.004;
        return Math.hypot(p.x - this.player.x, p.y - this.player.y) < 1400;
      });
    }
  }

  stepDayNight(dt) {
    this.renderer.stepTime(dt);
  }

  stepAudio(dt) {
    const hunting = this.stars() >= 1 && (this.cars.some((c) => c.kind === 'police' && !c.wreck) || this.cops.length > 0);
    if (hunting) {
      this.sound.sirenStart();
      this.sound.sirenUpdate(dt);
    } else {
      this.sound.sirenStop();
    }
    if (!this.player.inCar) this.sound.engineStop();
  }

  stepCamera(dt) {
    this.renderer.camera.follow(this.player, dt);
  }

  stepSave(dt) {
    this.saveTimer += dt;
    if (this.saveTimer > 12) {
      this.saveTimer = 0;
      if (!this.player.dead) saveGame(this);
    }
  }

  /** Render the current screen (world + HUD, or the title backdrop). */
  draw() {
    if (this.screen === SCREEN_TITLE) {
      this.drawTitle();
      return;
    }
    this.renderer.draw(this);
    this.hud.draw(this.renderer.ctx, this, this.canvas, this.input);
    if (this.screen === SCREEN_PAUSED) this.drawPause();
  }

  drawTitle() {
    const ctx = this.renderer.ctx;
    const W = this.canvas.width / (this.renderer.dpr || 1);
    const H = this.canvas.height / (this.renderer.dpr || 1);
    // Slow pan over the city as a backdrop.
    const t = performance.now() / 1000;
    this.renderer.camera.x = WORLD_W / 2 + Math.sin(t * 0.06) * 420;
    this.renderer.camera.y = WORLD_H / 2 + Math.cos(t * 0.045) * 300;
    this.renderer.camera.zoom = 0.62;
    this.renderer.draw(this);

    ctx.fillStyle = 'rgba(8,10,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 64px monospace';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 12;
    ctx.fillText('PORT VERONA', W / 2, H * 0.32);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '16px monospace';
    ctx.fillText('A top-down open-world crime story', W / 2, H * 0.32 + 30);

    const blink = Math.floor(t * 1.6) % 2 === 0;
    ctx.fillStyle = blink ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.font = 'bold 18px monospace';
    if (this.hasSave) {
      ctx.fillText('[ENTER] Continue    [SPACE] New Game', W / 2, H * 0.62);
    } else {
      ctx.fillText('Press any key to start', W / 2, H * 0.62);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px monospace';
    ctx.fillText('WASD move · E enter/exit car · F/Click fight · Mouse aim · 1/2 weapon · Esc pause · M mute', W / 2, H * 0.62 + 34);
    ctx.fillText('Original city, characters and story. Not affiliated with any commercial game.', W / 2, H * 0.62 + 54);
  }

  drawPause() {
    const ctx = this.renderer.ctx;
    const W = this.canvas.width / (this.renderer.dpr || 1);
    const H = this.canvas.height / (this.renderer.dpr || 1);
    ctx.fillStyle = 'rgba(8,10,20,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('PAUSED', W / 2, H / 2 - 20);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '14px monospace';
    ctx.fillText('Esc to resume', W / 2, H / 2 + 16);
  }
}
