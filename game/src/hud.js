// HUD: health bar and wanted stars, money counter, the mission panel, a live minimap
// of the whole city (roads, water, player, cars, police, mission marker), a
// speedometer while driving, the crosshair, the location readout and the
// mission-start flash cards. Everything is drawn in screen space.
import { COLS, ROAD_W, ROWS, TILE, WORLD_H, WORLD_W } from './config.js';
import { daylight } from './render.js';

export class Hud {
  constructor() {
    this.minimapSize = 190;
  }

  draw(ctx, game, canvas, input) {
    const W = canvas.width / (game.renderer?.dpr || 1);
    const H = canvas.height / (game.renderer?.dpr || 1);
    const pl = game.player;

    this.drawHealth(ctx, pl, 18, H - 18 - this.minimapSize - 34);
    this.drawWanted(ctx, game, W - 18, 22);
    this.drawMoney(ctx, pl, W - 18, 62);
    this.drawMinimap(ctx, game, 18, H - 18 - this.minimapSize);
    this.drawMission(ctx, game, 18, 18);
    this.drawSpeedo(ctx, pl, W - 18, H - 18);
    this.drawLocation(ctx, game, W / 2, H - 14);
    this.drawCrosshair(ctx, game, input, W, H);
    this.drawFlash(ctx, game.missions, W, H);
    this.drawHints(ctx, game, W, H);
  }

  drawHealth(ctx, pl, x, y) {
    const w = 190;
    const h = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, y, w, h);
    const frac = Math.max(0, pl.health / pl.maxHealth);
    ctx.fillStyle = frac > 0.5 ? '#4fbf5a' : frac > 0.25 ? '#e0b84a' : '#d04040';
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HEALTH', x + 4, y + 10);
  }

  drawWanted(ctx, game, x, y) {
    const stars = game.stars();
    ctx.textAlign = 'right';
    ctx.font = '16px monospace';
    for (let i = 0; i < 5; i += 1) {
      const sx = x - (4 - i) * 24;
      const filled = i < stars;
      ctx.save();
      if (filled && Math.floor(performance.now() / 300) % 2 === 0 && stars > 0) {
        ctx.shadowColor = '#ffd24a';
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = filled ? '#ffd24a' : 'rgba(255,255,255,0.18)';
      this.starPath(ctx, sx, y, 9);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '9px monospace';
    ctx.fillText('WANTED', x, y + 20);
  }

  starPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  drawMoney(ctx, pl, x, y) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(`$${pl.money}`, x + 2, y + 2);
    ctx.fillStyle = '#4fd873';
    ctx.fillText(`$${pl.money}`, x, y);
  }

  drawMission(ctx, game, x, y) {
    const lines = game.missions.hudLines();
    if (!lines && !game.missions.finished) {
      // No active mission: the next giver is calling back.
      if (game.missions.pendingNext > 0) {
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - 6, y - 6, 300, 34);
        ctx.fillStyle = '#ffd24a';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('INCOMING CALL', x, y + 8);
        ctx.fillStyle = '#fff';
        ctx.font = '11px monospace';
        ctx.fillText('Mara is lining up the next job...', x, y + 24);
      }
      return;
    }
    if (game.missions.finished) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - 6, y - 6, 320, 34);
      ctx.fillStyle = '#4fd873';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('STORY COMPLETE', x, y + 8);
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.fillText('Port Verona is yours. Free roam.', x, y + 24);
      return;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 6, y - 6, 340, 40);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(lines.title.toUpperCase(), x, y + 8);
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.fillText(lines.text, x, y + 24);
  }

  drawMinimap(ctx, game, x, y) {
    const s = this.minimapSize;
    const sx = s / WORLD_W;
    const sy = s / WORLD_H;
    // Frame.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 4, y - 4, s + 8, s + 8);
    ctx.fillStyle = '#23262f';
    ctx.fillRect(x, y, s, s);
    // Water band.
    ctx.fillStyle = '#2f6f9a';
    ctx.fillRect(x, y + (WORLD_H - 26) * sy, s, 26 * sy);
    // Roads.
    ctx.strokeStyle = '#8a8f9c';
    ctx.lineWidth = Math.max(1, ROAD_W * sx);
    ctx.beginPath();
    for (let j = 0; j <= ROWS; j += 1) {
      ctx.moveTo(x, y + j * TILE * sy);
      ctx.lineTo(x + s, y + j * TILE * sy);
    }
    for (let i = 0; i <= COLS; i += 1) {
      ctx.moveTo(x + i * TILE * sx, y);
      ctx.lineTo(x + i * TILE * sx, y + s);
    }
    ctx.stroke();
    // Parks.
    ctx.fillStyle = '#3f6a3f';
    for (const p of game.city.parks) {
      ctx.fillRect(x + p.x * sx, y + p.y * sy, Math.max(2, p.w * sx), Math.max(2, p.h * sy));
    }
    // Cars.
    for (const c of game.cars) {
      ctx.fillStyle = c.kind === 'police' ? '#5a9af0' : (c.wreck ? '#555' : '#aaa');
      ctx.fillRect(x + c.x * sx - 1.5, y + c.y * sy - 1.5, 3, 3);
    }
    // Cops on foot.
    ctx.fillStyle = '#5a9af0';
    for (const c of game.cops) {
      ctx.fillRect(x + c.x * sx - 1.5, y + c.y * sy - 1.5, 3, 3);
    }
    // Mission marker.
    const m = game.missions.marker();
    if (m) {
      const mx = m.follow ? game.player.x : m.x;
      const my = m.follow ? game.player.y : m.y;
      const blink = Math.floor(performance.now() / 400) % 2 === 0;
      ctx.fillStyle = blink ? '#ffd24a' : '#fff3c0';
      ctx.beginPath();
      ctx.arc(x + mx * sx, y + my * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const pl = game.player;
    const px = x + pl.x * sx;
    const py = y + pl.y * sy;
    const ang = pl.inCar ? pl.inCar.angle : game.aimAngle;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North label.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', x + s / 2, y + 10);
  }

  drawSpeedo(ctx, pl, x, y) {
    const car = pl.inCar;
    if (!car) return;
    const speed = Math.round(Math.abs(car.speed) * 0.55); // km/h-ish
    ctx.textAlign = 'right';
    ctx.font = 'bold 30px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(`${speed}`, x + 2, y + 2);
    ctx.fillStyle = speed > 160 ? '#ff9a4a' : '#fff';
    ctx.fillText(`${speed}`, x, y);
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('KM/H', x, y - 26);
  }

  drawLocation(ctx, game, x, y) {
    const name = game.city.streetNameAt(game.player.x, game.player.y);
    if (!name) return;
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(name.toUpperCase(), x + 1, y + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(name.toUpperCase(), x, y);
  }

  drawCrosshair(ctx, game, input, W, H) {
    if (game.player.inCar || game.player.dead) return;
    const x = input.mouseX;
    const y = input.mouseY;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
  }

  drawFlash(ctx, runner, W, H) {
    if (!runner.flashText || runner.flashTimer <= 0) return;
    const a = Math.min(1, runner.flashTimer / 1.2);
    const { title, text } = runner.flashText;
    ctx.textAlign = 'center';
    const boxW = Math.min(620, W - 80);
    const cx = W / 2;
    const cy = H * 0.30;
    ctx.fillStyle = `rgba(10,14,24,${0.72 * a})`;
    ctx.fillRect(cx - boxW / 2, cy - 46, boxW, 92);
    ctx.strokeStyle = `rgba(255,210,74,${0.8 * a})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - boxW / 2, cy - 46, boxW, 92);
    ctx.fillStyle = `rgba(255,210,74,${a})`;
    ctx.font = 'bold 20px monospace';
    ctx.fillText(title.toUpperCase(), cx, cy - 14);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.font = '13px monospace';
    // Wrap the intro text at ~78 columns.
    const words = text.split(' ');
    let line = '';
    let lineY = cy + 10;
    for (const word of words) {
      if ((line + word).length > 78) {
        ctx.fillText(line, cx, lineY);
        lineY += 17;
        line = '';
      }
      line += word + ' ';
    }
    if (line) ctx.fillText(line, cx, lineY);
  }

  drawHints(ctx, game, W, H) {
    // Contextual interaction hint (enter/exit car).
    const pl = game.player;
    let hint = null;
    if (pl.inCar) hint = '[E] Exit car';
    else {
      const c = game.nearestCar(pl.x, pl.y, 46);
      if (c) hint = c.kind === 'police' ? '[E] Steal police car' : '[E] Steal car';
    }
    if (!hint) return;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(hint, W / 2 + 1, H - 46 + 1);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(hint, W / 2, H - 46);
  }
}
