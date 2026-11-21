// The story of Port Verona: six missions given by named characters, each a chain of
// objectives (reach a marker, deliver a package, kill rivals, escort an ally, survive
// a wanted storm, and the finale heist). The runner tracks progress, updates the HUD
// text, pays out money and advances the plot.
import { TILE, WORLD_H, WORLD_W } from './config.js';
import { makePed } from './entities.js';

const M = (id, giver, title, intro, pages) => ({ id, giver, title, intro, pages });

export const MISSIONS = [
  M(0, 'Mara Delgado', 'New in Town',
    "Nicky Vale, you made it. Port Verona is a big town for a small-timer — let's see if you can drive. Head to the warehouse on Foundry Rd.",
    [
      { text: 'Drive to the warehouse on Foundry Rd', kind: 'goto', x: 4 * TILE, y: 4 * TILE, reward: 250 },
    ]),
  M(1, 'Mara Delgado', 'Package Run',
    "Sal Okafor needs his goods, no questions. Pick the package up at the docks, then bring it to him in Little Verona before he changes his mind.",
    [
      { text: 'Pick up the package at the docks', kind: 'goto', x: 9 * TILE, y: 6 * TILE, reward: 0, give: 'package' },
      { text: 'Deliver the package to Sal', kind: 'goto', x: 2 * TILE, y: 2 * TILE, reward: 400, take: 'package' },
    ]),
  M(2, 'Sal Okafor', 'Unwelcome',
    "The Kestrel's crew thinks they can muscle onto my block. Three of their shooters are loitering on Kestrel Row. Go explain Port Verona's hospitality.",
    [
      { text: 'Take down 3 Kestrel shooters', kind: 'kill', count: 3, reward: 600 },
    ]),
  M(3, 'Sal Okafor', 'Ride Along',
    "My cousin Didi is at the casino and the Kestrels are watching the exits. Get her and bring her back to my place, safe and sound.",
    [
      { text: 'Pick up Didi at the casino', kind: 'goto', x: 9 * TILE, y: 5 * TILE + 40, reward: 0, ally: 'Didi' },
      { text: 'Bring Didi back to Sal', kind: 'goto', x: 2 * TILE, y: 2 * TILE, reward: 800 },
    ]),
  M(4, 'Mara Delgado', 'Heat',
    "The cops are getting comfortable. I need them chasing shadows for a while — give them a run, keep the heat on you for sixty seconds without checking into the hospital.",
    [
      { text: 'Survive 60 seconds with a 3-star wanted level', kind: 'survive', time: 60, wanted: 3, reward: 1000 },
    ]),
  M(5, 'Mara Delgado', 'Last Job',
    "One score retires us all: the Kestrel stash is sitting in their lockup on Cinder St. Grab it, lose the cops, and meet me at the safehouse by the beach. Don't be late, Nicky.",
    [
      { text: 'Grab the take from the Kestrel lockup', kind: 'goto', x: 10 * TILE, y: 1 * TILE, reward: 0, give: 'take', heat: 60 },
      { text: 'Lose the cops and reach the safehouse', kind: 'goto', x: 5 * TILE, y: 7 * TILE + 30, reward: 2500, take: 'take', mustLose: true },
    ]),
];

export class MissionRunner {
  constructor(game) {
    this.game = game;
    this.index = -1;            // -1 = no mission active
    this.page = 0;
    this.timer = 0;
    this.killCount = 0;
    this.active = false;
    this.finished = false;
    this.flashText = null;
    this.flashTimer = 0;
    this.pendingNext = 0;        // seconds until the next job calls in
  }

  /** Mission index available next (from save progress). */
  startAt(missionIndex) {
    this.index = missionIndex - 1;
  }

  /** Begin the next mission if any remain. */
  beginNext() {
    const next = this.index + 1;
    if (next >= MISSIONS.length) { this.finished = true; return false; }
    this.index = next;
    this.page = 0;
    this.timer = 0;
    this.killCount = 0;
    this.active = true;
    const mission = MISSIONS[next];
    this.showFlash(`${mission.title}`, mission.intro);
    this.applyPage();
    return true;
  }

  showFlash(title, text) {
    this.flashText = { title, text };
    this.flashTimer = 6.0;
  }

  currentMission() {
    return this.active ? MISSIONS[this.index] : null;
  }

  currentPage() {
    const m = this.currentMission();
    return m ? m.pages[this.page] : null;
  }

  /** The world-space marker for the current objective, if any. */
  marker() {
    const p = this.currentPage();
    if (!p) return null;
    if (p.kind === 'goto') return { x: p.x, y: p.y, r: 46 };
    if (p.kind === 'survive') return { x: this.game.player.x, y: this.game.player.y, r: 46, follow: true };
    return null;
  }

  applyPage() {
    const p = this.currentPage();
    if (!p) return;
    if (p.kind === 'survive') {
      this.game.setWanted(p.wanted);
      this.game.heatLocked = true;
    }
    if (p.kind === 'kill') {
      // Spawn the rival shooters near the player, spread along the street.
      const g = this.game;
      for (let k = 0; k < p.count; k += 1) {
        const angle = (k / p.count) * Math.PI * 2;
        const dist = 260 + (k % 2) * 120;
        const sx = Math.max(60, Math.min(WORLD_W - 60, g.player.x + Math.cos(angle) * dist));
        const sy = Math.max(60, Math.min(WORLD_H - 60, g.player.y + Math.sin(angle) * dist));
        const enemy = makePed(g.rng, sx, sy);
        enemy.state = 'enemy';
        enemy.health = 70;
        enemy.shirt = '#5a3a2a';
        enemy.fireTimer = 1.2 + k * 0.4;
        g.enemies.push(enemy);
      }
    }
    if (p.ally) {
      // Didi waits at the marker; she joins when the player arrives.
      const g = this.game;
      const ally = makePed(g.rng, p.x + 30, p.y + 10);
      ally.state = 'allyWaiting';
      ally.shirt = '#c94f8a';
      ally.name = p.ally;
      g.ally = ally;
      g.peds.push(ally);
    }
  }

  update(dt) {
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (!this.active) {
      // Between jobs: the next giver calls back after a beat.
      if (!this.finished && this.pendingNext > 0) {
        this.pendingNext -= dt;
        if (this.pendingNext <= 0) this.beginNext();
      }
      return;
    }
    const p = this.currentPage();
    if (!p) return;
    const g = this.game;

    if (p.kind === 'survive') {
      this.timer += dt;
      if (this.timer >= p.time) {
        g.heatLocked = false;
        this.completePage();
        return;
      }
      // Keep the wanted level pinned while surviving.
      if (g.stars() < p.wanted) g.setWanted(p.wanted);
      return;
    }

    if (p.kind === 'kill') {
      if (this.killCount >= p.count) this.completePage();
      return;
    }

    if (p.kind === 'goto') {
      const m = this.marker();
      const pl = g.player;
      const d = Math.hypot(pl.x - m.x, pl.y - m.y);
      if (d < m.r) {
        if (p.give) g.inventory.push(p.give);
        if (p.heat) g.addHeat(p.heat);
        if (p.ally && g.ally && g.ally.state === 'allyWaiting') {
          g.ally.state = 'ally';
          g.sound?.pickup();
          this.showFlash('Didi', "Took you long enough. Get me out of here, Nicky.");
        }
        // If the page takes an item, require having it.
        if (p.take && !g.inventory.includes(p.take)) return;
        if (p.mustLose && g.stars() > 0) {
          // Must lose the cops first: nudge the player with a hint once.
          if (!this.hintShown) {
            this.hintShown = true;
            this.showFlash('Lose the cops', 'Shake the police before the safehouse — break their line of sight.');
          }
          return;
        }
        this.completePage();
      }
    }
  }

  completePage() {
    const g = this.game;
    const p = this.currentPage();
    const mission = this.currentMission();
    if (p.take) g.inventory = g.inventory.filter((i) => i !== p.take);
    if (p.reward) {
      g.player.money += p.reward;
      g.sound?.missionDone();
    }
    this.page += 1;
    if (this.page >= mission.pages.length) {
      this.active = false;
      g.sound?.missionDone();
      this.showFlash('Mission complete', `${mission.title} — $${p.reward || mission.pages[mission.pages.length - 1].reward} earned. ${this.index + 1 < MISSIONS.length ? MISSIONS[this.index + 1].giver + ' will be in touch.' : 'That was the last one. Port Verona is yours, Nicky.'}`);
      this.pendingNext = this.index + 1 < MISSIONS.length ? 8 : 0;
      g.onMissionComplete();
    } else {
      this.showFlash(mission.title, mission.pages[this.page].text);
      this.applyPage();
    }
  }

  /** Count a kill toward a kill objective (rival shooters only). */
  onEnemyKilled() {
    this.killCount += 1;
  }

  /** HUD lines for the current objective. */
  hudLines() {
    const p = this.currentPage();
    if (!p) return null;
    if (p.kind === 'survive') {
      return { title: this.currentMission().title, text: `Survive the heat: ${(p.time - this.timer).toFixed(0)}s left` };
    }
    if (p.kind === 'kill') {
      return { title: this.currentMission().title, text: `${p.text} (${this.killCount}/${p.count})` };
    }
    return { title: this.currentMission().title, text: p.text };
  }
}
