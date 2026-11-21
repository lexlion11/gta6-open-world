// World renderer: a top-down camera that follows the player (zoomed out in a car),
// the city drawn as asphalt, sidewalks, pastel buildings with pseudo-height shadows,
// parks, beach and water, cars with headlights at night, pedestrians, bullets,
// particles, a day/night cycle with lit windows and street lights, and screen shake.
import { COLS, ROAD_W, ROWS, SIDEWALK, TILE, WORLD_H, WORLD_W } from './config.js';

const NIGHT_COLOR = 'rgba(10,16,42,';
const DUSK_COLOR = 'rgba(60,40,20,';

/** Smooth 0..1 daylight curve over one full day cycle. */
export function daylight(time) {
  // time 0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.
  const d = Math.cos((time - 0.5) * Math.PI * 2); // 1 at noon, -1 at midnight
  return Math.max(0, Math.min(1, 0.55 + 0.45 * d));
}

export class Camera {
  constructor() {
    this.x = WORLD_W / 2;
    this.y = WORLD_H / 2;
    this.zoom = 1.1;
    this.targetZoom = 1.1;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  follow(player, dt) {
    const tx = player.inCar ? player.inCar.x : player.x;
    const ty = player.inCar ? player.inCar.y : player.y;
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.targetZoom = player.inCar ? 0.88 : 1.12;
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.pow(0.02, dt));
  }

  applyShake(amount) {
    this.shakeX = (Math.random() - 0.5) * amount;
    this.shakeY = (Math.random() - 0.5) * amount;
  }

  begin(ctx, canvas) {
    ctx.save();
    ctx.setTransform(this.zoom, 0, 0, this.zoom, 0, 0);
    ctx.translate(canvas.width / 2 / this.zoom - this.x + this.shakeX, canvas.height / 2 / this.zoom - this.y + this.shakeY);
  }

  end(ctx) {
    ctx.restore();
  }

  screenToWorld(sx, sy, canvas) {
    return {
      x: (sx - canvas.width / 2) / this.zoom + this.x - this.shakeX,
      y: (sy - canvas.height / 2) / this.zoom + this.y - this.shakeY,
    };
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Pseudo-random from an integer, for deterministic window patterns. */
function hash(n) {
  let h = (n * 374761393 + 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera();
    this.time = 0.30;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
  }

  /** Main world pass. */
  draw(game) {
    const ctx = this.ctx;
    const cam = this.camera;
    const light = daylight(this.time);
    ctx.fillStyle = '#23262f';
    ctx.fillRect(0, 0, this.canvas.width / (this.dpr || 1), this.canvas.height / (this.dpr || 1));

    cam.begin(ctx, this.canvas);
    const view = this.visibleWorld();

    this.drawGround(ctx, game, view);
    this.drawRoads(ctx, view);
    this.drawParks(ctx, game, view);
    this.drawBeach(ctx, game, view);
    this.drawBuildings(ctx, game, view, light);
    this.drawTrees(ctx, game, view);
    this.drawMarkers(ctx, game);
    this.drawCars(ctx, game, light);
    this.drawPeds(ctx, game);
    this.drawPlayer(ctx, game);
    this.drawBullets(ctx, game);
    this.drawParticles(ctx, game);
    this.drawNight(ctx, game, view, light);

    cam.end(ctx);
  }

  visibleWorld() {
    const w = this.canvas.width / (this.dpr || 1) / this.camera.zoom;
    const h = this.canvas.height / (this.dpr || 1) / this.camera.zoom;
    return {
      x: this.camera.x - w / 2 - 80,
      y: this.camera.y - h / 2 - 80,
      w: w + 160,
      h: h + 160,
    };
  }

  inView(view, x, y, pad = 40) {
    return x > view.x - pad && x < view.x + view.w + pad && y > view.y - pad && y < view.y + view.h + pad;
  }

  drawGround(ctx, game, view) {
    // Block ground: a warm concrete tone under everything not road.
    ctx.fillStyle = '#4a4a52';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    // Sidewalk bands along every block edge, slightly lighter.
    ctx.fillStyle = '#5c5c66';
    for (let j = 0; j < ROWS; j += 1) {
      for (let i = 0; i < COLS; i += 1) {
        const x = i * TILE + ROAD_W / 2;
        const y = j * TILE + ROAD_W / 2;
        if (x + TILE > view.x && x < view.x + view.w && y + TILE > view.y && y < view.y + view.h) {
          ctx.fillRect(x, y, TILE - ROAD_W, TILE - ROAD_W);
        }
      }
    }
  }

  drawRoads(ctx, view) {
    ctx.fillStyle = '#33363f';
    const half = ROAD_W / 2;
    // Horizontal roads.
    for (let j = 0; j <= ROWS; j += 1) {
      const y = j * TILE - half;
      if (y + ROAD_W > view.y && y < view.y + view.h) {
        ctx.fillRect(Math.max(0, view.x), y, Math.min(WORLD_W, view.x + view.w) - Math.max(0, view.x), ROAD_W);
      }
    }
    // Vertical roads.
    for (let i = 0; i <= COLS; i += 1) {
      const x = i * TILE - half;
      if (x + ROAD_W > view.x && x < view.x + view.w) {
        ctx.fillRect(x, Math.max(0, view.y), ROAD_W, Math.min(WORLD_H, view.y + view.h) - Math.max(0, view.y));
      }
    }
    // Lane dashes along the centerlines.
    ctx.strokeStyle = '#c8c8b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 16]);
    ctx.beginPath();
    for (let j = 0; j <= ROWS; j += 1) {
      const y = j * TILE;
      if (y + 4 > view.y && y - 4 < view.y + view.h) {
        ctx.moveTo(Math.max(0, view.x), y);
        ctx.lineTo(Math.min(WORLD_W, view.x + view.w), y);
      }
    }
    for (let i = 0; i <= COLS; i += 1) {
      const x = i * TILE;
      if (x + 4 > view.x && x - 4 < view.x + view.w) {
        ctx.moveTo(x, Math.max(0, view.y));
        ctx.lineTo(x, Math.min(WORLD_H, view.y + view.h));
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawParks(ctx, game, view) {
    for (const park of game.city.parks) {
      if (!this.inView(view, park.x + park.w / 2, park.y + park.h / 2, 200)) continue;
      ctx.fillStyle = '#4f7a4a';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.strokeStyle = '#6a9a60';
      ctx.lineWidth = 3;
      ctx.strokeRect(park.x + 2, park.y + 2, park.w - 4, park.h - 4);
      if (park.pond) {
        ctx.fillStyle = '#3a6a8a';
        const pw = park.w * 0.4;
        const ph = park.h * 0.3;
        ctx.beginPath();
        ctx.ellipse(park.x + park.w / 2, park.y + park.h / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const plaza of game.city.plazas) {
      if (!this.inView(view, plaza.x + plaza.w / 2, plaza.y + plaza.h / 2, 200)) continue;
      ctx.fillStyle = '#6a6256';
      ctx.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
      ctx.strokeStyle = '#7e7666';
      ctx.lineWidth = 2;
      ctx.strokeRect(plaza.x + 2, plaza.y + 2, plaza.w - 4, plaza.h - 4);
    }
  }

  drawBeach(ctx, game, view) {
    // Sand band across the south of the map, then water at the very bottom.
    const sandY = (ROWS - 1) * TILE - ROAD_W / 2;
    if (sandY < view.y + view.h) {
      ctx.fillStyle = '#e2d3a4';
      ctx.fillRect(Math.max(0, view.x), sandY, Math.min(WORLD_W, view.x + view.w) - Math.max(0, view.x), WORLD_H - 26 - sandY);
      // Water with a gentle gradient and wave lines.
      ctx.fillStyle = '#2f6f9a';
      ctx.fillRect(Math.max(0, view.x), WORLD_H - 26, Math.min(WORLD_W, view.x + view.w) - Math.max(0, view.x), 26);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const t = performance.now() / 1000;
      for (let x = Math.max(0, Math.floor(view.x / 40)) * 40; x < view.x + view.w; x += 40) {
        ctx.moveTo(x, WORLD_H - 18 + Math.sin(t * 1.5 + x * 0.05) * 3);
        ctx.lineTo(x + 18, WORLD_H - 18 + Math.sin(t * 1.5 + x * 0.05 + 1) * 3);
      }
      ctx.stroke();
    }
  }

  drawBuildings(ctx, game, view, light) {
    for (const b of game.city.buildings) {
      if (!this.inView(view, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      // Drop shadow offset to the south-east, sized by pseudo-height.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + 5, b.y + 5 + b.height * 0.35, b.w, b.h);
      // Walls (the building's side, drawn as a band toward the shadow side).
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h - Math.min(10, b.height * 0.3));
      // Roof inset.
      ctx.fillStyle = b.roof;
      const inset = 6;
      ctx.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2 - Math.min(10, b.height * 0.3));
      // Roof trim line.
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2 - Math.min(10, b.height * 0.3));

      // Windows at night: deterministic lit grid.
      if (light < 0.72) {
        const cols = b.windows;
        const rows = Math.max(2, Math.floor(b.h / 26));
        const litAlpha = (0.72 - light) * 1.4;
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            if (hash(b.seed + r * 31 + c * 7) > 0.45) continue;
            const wx = b.x + inset + 4 + c * ((b.w - inset * 2 - 8) / cols);
            const wy = b.y + inset + 4 + r * ((b.h - inset * 2 - 8) / rows);
            const ww = Math.max(3, (b.w - inset * 2 - 8) / cols - 5);
            const wh = Math.max(3, (b.h - inset * 2 - 8) / rows - 6);
            ctx.fillStyle = `rgba(255,224,150,${Math.min(0.9, litAlpha * (0.5 + hash(b.seed + c * 13 + r * 29) * 0.5))})`;
            ctx.fillRect(wx, wy, ww, wh);
          }
        }
      }

      // Landmark signage.
      if (b.kind === 'hospital') {
        ctx.fillStyle = '#c83a3a';
        ctx.fillRect(b.x + b.w / 2 - 9, b.y + 8, 18, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x + b.w / 2 - 3, b.y + 11, 6, 12);
        ctx.fillRect(b.x + b.w / 2 - 7, b.y + 15, 14, 4);
      } else if (b.kind === 'police') {
        ctx.fillStyle = '#2f5f8f';
        ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 12);
      } else if (b.kind === 'casino') {
        // Neon strip along the roof at night.
        const neon = light < 0.72 ? '#ff4fd8' : '#7a4a8a';
        ctx.fillStyle = neon;
        ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 5);
        if (light < 0.72) {
          ctx.save();
          ctx.shadowColor = '#ff4fd8';
          ctx.shadowBlur = 14;
          ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 5);
          ctx.restore();
        }
      } else if (b.kind === 'tower') {
        // Antenna with a blinking light.
        ctx.strokeStyle = '#556';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w / 2, b.y);
        ctx.lineTo(b.x + b.w / 2, b.y - 22);
        ctx.stroke();
        const blink = Math.sin(performance.now() / 400) > 0 ? '#ff5050' : '#602020';
        ctx.fillStyle = blink;
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y - 24, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTrees(ctx, game, view) {
    for (const t of game.city.trees) {
      if (!this.inView(view, t.x, t.y, 60)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? '#3a7a4a' : '#2f5d3a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? '#4f9a5a' : '#3f7a4a';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawMarkers(ctx, game) {
    const m = game.missions.marker();
    if (!m) return;
    const t = performance.now() / 1000;
    const pulse = 1 + Math.sin(t * 4) * 0.12;
    const x = m.follow ? game.player.x : m.x;
    const y = m.follow ? game.player.y : m.y;
    // A glowing pillar marker, classic open-world style.
    ctx.save();
    ctx.shadowColor = '#ffd24a';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(255,210,74,0.28)';
    ctx.beginPath();
    ctx.arc(x, y, m.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff3c0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 13 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawCar(ctx, car, light) {
    const isPolice = car.kind === 'police';
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const w = car.width;
    const l = car.length;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, -l / 2 + 3, -w / 2 + 3, l, w, 7);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.wreck ? '#3a3a3a' : car.color;
    roundRect(ctx, -l / 2, -w / 2, l, w, 7);
    ctx.fill();
    if (isPolice && !car.wreck) {
      // White doors with a blue band.
      ctx.fillStyle = '#e8eef4';
      ctx.fillRect(-l / 2 + 8, -w / 2, l * 0.35, w);
      ctx.fillStyle = '#2f4f8f';
      ctx.fillRect(-l / 2 + 8, -w / 2, l * 0.35, w * 0.28);
      ctx.fillRect(-l / 2 + 8, w / 2 - w * 0.28, l * 0.35, w * 0.28);
    }
    // Roof / cabin.
    ctx.fillStyle = car.wreck ? '#222' : (car.roof ?? '#26282e');
    roundRect(ctx, -l * 0.16, -w / 2 + 4, l * 0.42, w - 8, 4);
    ctx.fill();
    // Windshield glint.
    if (!car.wreck) {
      ctx.fillStyle = 'rgba(180,210,235,0.55)';
      ctx.fillRect(l * 0.18, -w / 2 + 5, 5, w - 10);
    }
    // Headlights at night.
    if (light < 0.72 && !car.wreck) {
      ctx.fillStyle = '#fff2c8';
      ctx.fillRect(l / 2 - 3, -w / 2 + 3, 3, 5);
      ctx.fillRect(l / 2 - 3, w / 2 - 8, 3, 5);
      // Taillights.
      ctx.fillStyle = '#c83a3a';
      ctx.fillRect(-l / 2, -w / 2 + 3, 2, 5);
      ctx.fillRect(-l / 2, w / 2 - 8, 2, 5);
    }
    ctx.restore();

    // Headlight cones (world space, drawn after restore).
    if (light < 0.72 && !car.wreck && Math.abs(car.speed) > 4) {
      const reach = 130;
      const a = car.angle;
      const fx = Math.cos(a);
      const fy = Math.sin(a);
      const px = -fy;
      const py = fx;
      const grad = ctx.createRadialGradient(car.x + fx * 20, car.y + fy * 20, 8, car.x + fx * reach, car.y + fy * reach, reach * 0.9);
      grad.addColorStop(0, 'rgba(255,240,190,0.32)');
      grad.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(car.x + fx * 10 + px * 10, car.y + fy * 10 + py * 10);
      ctx.lineTo(car.x + fx * reach + px * 34, car.y + fy * reach + py * 34);
      ctx.lineTo(car.x + fx * reach - px * 34, car.y + fy * reach - py * 34);
      ctx.lineTo(car.x + fx * 10 - px * 10, car.y + fy * 10 - py * 10);
      ctx.closePath();
      ctx.fill();
    }
    // Police flashers.
    if (isPolice && !car.wreck) {
      const on = Math.floor(performance.now() / 260) % 2 === 0;
      ctx.fillStyle = on ? '#ff4040' : '#4060ff';
      ctx.save();
      ctx.shadowColor = on ? '#ff4040' : '#4060ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(car.x - 6, car.y - 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on ? '#4060ff' : '#ff4040';
      ctx.beginPath();
      ctx.arc(car.x - 6, car.y + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Wreck smoke.
    if (car.wreck) {
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.beginPath();
      ctx.arc(car.x, car.y - 14, 9 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCars(ctx, game, light) {
    for (const car of game.cars) this.drawCar(ctx, car, light);
  }

  drawPed(ctx, ped) {
    if (ped.state === 'dead') {
      // Chalk outline: a light splat where the body fell.
      ctx.fillStyle = 'rgba(200,60,50,0.35)';
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 12, 8, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs.
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-4, -6, 8, 12);
    // Torso.
    ctx.fillStyle = ped.state === 'enemy' ? '#5a3a2a' : ped.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(1, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPeds(ctx, game) {
    for (const ped of game.peds) this.drawPed(ctx, ped);
    for (const cop of game.cops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f4f6f';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d3550';
      ctx.fillRect(-4, -6, 8, 12);
      ctx.fillStyle = '#e8c8a8';
      ctx.beginPath();
      ctx.arc(2, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      // Cap.
      ctx.fillStyle = '#1d3550';
      ctx.beginPath();
      ctx.arc(3, 0, 4.4, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.restore();
    }
    for (const enemy of game.enemies) this.drawPed(ctx, enemy);
  }

  drawPlayer(ctx, game) {
    const pl = game.player;
    if (pl.inCar) return; // drawn as the car
    if (pl.dead) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#3a6ea8';
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const aim = game.aimAngle;
    ctx.save();
    ctx.translate(pl.x, pl.y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (pl.invuln > 0 && Math.floor(performance.now() / 120) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    ctx.rotate(aim);
    // Legs.
    ctx.fillStyle = pl.pants;
    ctx.fillRect(-5, -7, 10, 14);
    // Jacket.
    ctx.fillStyle = pl.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = pl.skin;
    ctx.beginPath();
    ctx.arc(2, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    // Pistol held forward.
    if (pl.weapon === 'pistol') {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(6, -2.5, 10, 5);
    }
    ctx.restore();
    // Aim line to the cursor.
    if (pl.weapon === 'pistol') {
      ctx.strokeStyle = 'rgba(255,80,80,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(pl.x, pl.y);
      ctx.lineTo(pl.x + Math.cos(aim) * 90, pl.y + Math.sin(aim) * 90);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawBullets(ctx, game) {
    ctx.fillStyle = '#ffe9a8';
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.owner === 'player' ? 3 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(ctx, game) {
    for (const p of game.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      if (p.kind === 'blood') {
        ctx.fillStyle = '#a02828';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'explosion') {
        ctx.fillStyle = a > 0.6 ? '#ffd24a' : '#d85a20';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.4 - a * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = '#ffce6a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.kind === 'cash') {
        ctx.fillStyle = '#4fbf4f';
        ctx.fillRect(p.x, p.y, 5, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawNight(ctx, game, view, light) {
    if (light >= 0.98) return;
    // Dusk tint near sunrise/sunset, deep blue at night.
    const nightAmt = 1 - light;
    const alpha = nightAmt * 0.55;
    ctx.fillStyle = `${NIGHT_COLOR}${alpha})`;
    ctx.fillRect(view.x, view.y, view.w, view.h);

    if (nightAmt > 0.25) {
      // Street lights at intersections.
      for (const l of game.city.streetLights) {
        if (!this.inView(view, l.x, l.y, 60)) continue;
        const grad = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 46);
        grad.addColorStop(0, `rgba(255,225,160,${0.30 * nightAmt})`);
        grad.addColorStop(1, 'rgba(255,225,160,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 46, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Advance the day/night clock. */
  stepTime(dt) {
    this.time = (this.time + dt / (60 * 6)) % 1; // six-minute day
    return this.time;
  }
}
