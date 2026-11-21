// The city of Port Verona: a seeded grid of named streets, blocks of pastel buildings,
// parks, a beach district on the south edge, and landmarks (hospital, police station,
// casino, tower). Provides road queries, building collision and spawn helpers.
import { COLS, ROWS, ROAD_W, SIDEWALK, TILE, WORLD_H, WORLD_W } from './config.js';
import { between, chance, makeRng, pickFrom, pickInt } from './rng.js';

const H_STREETS = ['Marlowe Ave', 'Delgado Way', 'Okafor St', 'Verona Blvd', 'Kestrel Row', 'Harbor Dr', 'Lantern St', 'Saltwind Ave'];
const V_STREETS = ['Palm Ave', 'Mercer St', 'Coral Way', 'Foundry Rd', 'Bayside Ave', 'Juniper St', 'Almond Ct', 'Dusk Ln', 'Gull St', 'Mirage Dr', 'Cinder St'];

const WALL_COLORS = ['#e8b4a0', '#d9c7a7', '#c9d3e0', '#b5c9b0', '#e0d3b0', '#d8b8c4', '#aec6d8', '#c4b8d8', '#e6cfa8', '#a8c0b8'];
const ROOF_COLORS = ['#c9957f', '#bba787', '#a9b4c4', '#93ab8f', '#c0b08c', '#bc96a4', '#8fa8bc', '#a492b8', '#c9b288', '#8cac9f'];

// Fixed landmarks: [cellCol, cellRow, kind]
const LANDMARKS = [
  [3, 2, 'hospital'],
  [7, 1, 'police'],
  [5, 3, 'tower'],
  [9, 5, 'casino'],
];

export class City {
  constructor(seed) {
    const rng = makeRng(seed);
    this.hNames = [];
    this.vNames = [];
    this.buildings = [];
    this.parks = [];
    this.plazas = [];
    this.landmarks = [];
    this.beachCells = [];
    this.trees = [];
    this.streetLights = [];
    this.hospital = null;
    this.policeStation = null;

    for (let j = 0; j < ROWS; j += 1) this.hNames.push(H_STREETS[j % H_STREETS.length]);
    for (let i = 0; i < COLS; i += 1) this.vNames.push(V_STREETS[i % V_STREETS.length]);

    const landmarkCells = new Map(LANDMARKS.map(([c, r, kind]) => [`${c},${r}`, kind]));

    for (let j = 0; j < ROWS - 1; j += 1) {
      for (let i = 0; i < COLS - 1; i += 1) {
        const kind = landmarkCells.get(`${i},${j}`);
        if (kind) {
          this.addLandmark(rng, i, j, kind);
          continue;
        }
        const roll = rng();
        if (j === ROWS - 2 && roll < 0.5) {
          this.beachCells.push({ i, j });
          this.fillBeach(rng, i, j);
          continue;
        }
        if (roll < 0.68) this.fillBlock(rng, i, j);
        else if (roll < 0.85) this.fillPark(rng, i, j);
        else this.fillPlaza(rng, i, j);
      }
    }
    // The southernmost row of cells is the beach strip itself.
    for (let i = 0; i < COLS - 1; i += 1) {
      this.beachCells.push({ i, j: ROWS - 1 });
      this.fillBeach(rng, i, ROWS - 1);
    }

    // Street lights at every intersection, for the night render pass.
    for (let j = 0; j <= ROWS; j += 1) {
      for (let i = 0; i <= COLS; i += 1) {
        this.streetLights.push({ x: i * TILE, y: j * TILE });
      }
    }
  }

  cellRect(i, j) {
    const pad = ROAD_W / 2 + SIDEWALK;
    return {
      x: i * TILE + pad,
      y: j * TILE + pad,
      w: TILE - 2 * pad,
      h: TILE - 2 * pad,
    };
  }

  addBuilding(rect, rng, opts = {}) {
    const colorIndex = pickInt(rng, 0, WALL_COLORS.length - 1);
    const b = {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      color: opts.color ?? WALL_COLORS[colorIndex],
      roof: opts.roof ?? ROOF_COLORS[colorIndex],
      height: opts.height ?? between(rng, 10, 34),
      windows: opts.windows ?? pickInt(rng, 3, 6),
      seed: pickInt(rng, 1, 4000),
      kind: opts.kind ?? 'building',
      lit: 0,
    };
    this.buildings.push(b);
    return b;
  }

  addLandmark(rng, i, j, kind) {
    const r = this.cellRect(i, j);
    const inner = { x: r.x + 10, y: r.y + 10, w: r.w - 20, h: r.h - 20 };
    if (kind === 'hospital') {
      const b = this.addBuilding(inner, rng, { color: '#e8eef2', roof: '#c6d2dc', height: 26, windows: 5, kind: 'hospital' });
      this.hospital = { x: b.x + b.w / 2, y: b.y + b.h / 2, building: b };
      this.landmarks.push(b);
    } else if (kind === 'police') {
      const b = this.addBuilding(inner, rng, { color: '#dfe6e4', roof: '#a9c2bd', height: 24, windows: 5, kind: 'police' });
      this.policeStation = { x: b.x + b.w / 2, y: b.y + b.h / 2, building: b };
      this.landmarks.push(b);
    } else if (kind === 'tower') {
      const b = this.addBuilding(inner, rng, { color: '#8f9aa8', roof: '#6b7484', height: 64, windows: 8, kind: 'tower' });
      this.landmarks.push(b);
    } else {
      const b = this.addBuilding(inner, rng, { color: '#2e2a4a', roof: '#1e1a38', height: 40, windows: 7, kind: 'casino' });
      this.landmarks.push(b);
    }
  }

  fillBlock(rng, i, j) {
    const r = this.cellRect(i, j);
    const splitX = chance(rng, 0.55);
    const splitY = chance(rng, 0.35);
    const gap = 8;
    if (!splitX && !splitY) {
      this.addBuilding(r, rng);
      return;
    }
    if (splitX) {
      const w = (r.w - gap) / 2;
      this.addBuilding({ x: r.x, y: r.y, w, h: r.h }, rng);
      this.addBuilding({ x: r.x + w + gap, y: r.y, w, h: r.h }, rng);
      if (splitY) {
        // four quarters: re-split vertically by adding two more on a second row
        return;
      }
    }
    if (splitY && !splitX) {
      const h = (r.h - gap) / 2;
      this.addBuilding({ x: r.x, y: r.y, w: r.w, h }, rng);
      this.addBuilding({ x: r.x, y: r.y + h + gap, w: r.w, h }, rng);
    }
  }

  fillPark(rng, i, j) {
    const r = this.cellRect(i, j);
    const park = { x: r.x, y: r.y, w: r.w, h: r.h, pond: chance(rng, 0.5) };
    this.parks.push(park);
    const count = pickInt(rng, 5, 9);
    for (let k = 0; k < count; k += 1) {
      this.trees.push({
        x: between(rng, r.x + 12, r.x + r.w - 12),
        y: between(rng, r.y + 12, r.y + r.h - 12),
        r: between(rng, 8, 14),
      });
    }
  }

  fillPlaza(rng, i, j) {
    const r = this.cellRect(i, j);
    this.plazas.push({ x: r.x, y: r.y, w: r.w, h: r.h });
    // A plaza holds one small kiosk building and some trees.
    const kw = between(rng, 40, 60);
    const kh = between(rng, 40, 60);
    this.addBuilding({
      x: between(rng, r.x + 10, r.x + r.w - kw - 10),
      y: between(rng, r.y + 10, r.y + r.h - kh - 10),
      w: kw, h: kh,
    }, rng, { height: 12, windows: 2 });
    const count = pickInt(rng, 2, 5);
    for (let k = 0; k < count; k += 1) {
      this.trees.push({
        x: between(rng, r.x + 12, r.x + r.w - 12),
        y: between(rng, r.y + 12, r.y + r.h - 12),
        r: between(rng, 7, 12),
      });
    }
  }

  fillBeach(rng, i, j) {
    // Sand with palms; the water band is drawn south of the last horizontal road.
    const r = this.cellRect(i, j);
    if (chance(rng, 0.7)) {
      const count = pickInt(rng, 1, 3);
      for (let k = 0; k < count; k += 1) {
        this.trees.push({
          x: between(rng, r.x + 10, r.x + r.w - 10),
          y: between(rng, r.y + 10, r.y + r.h - 10),
          r: between(rng, 8, 13),
          palm: true,
        });
      }
    }
    // A few beach huts.
    if (chance(rng, 0.35)) {
      const kw = between(rng, 34, 52);
      const kh = between(rng, 34, 52);
      this.addBuilding({
        x: between(rng, r.x + 8, r.x + r.w - kw - 8),
        y: between(rng, r.y + 8, r.y + r.h - kh - 8),
        w: kw, h: kh,
      }, rng, { height: 10, windows: 2, color: pickFrom(rng, ['#e6d3a8', '#d8c49a', '#e0cba0']) });
    }
  }

  /** Is the point on a road (within the road band of any street line)? */
  isRoad(x, y) {
    if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
    const mx = x % TILE;
    const my = y % TILE;
    const half = ROAD_W / 2;
    return mx < half || mx > TILE - half || my < half || my > TILE - half;
  }

  /** True when the point is inside the beach sand band (south of the last block row). */
  isBeach(x, y) {
    return y > (ROWS - 1) * TILE - ROAD_W / 2 - 4;
  }

  /** True when the point is over open water (the strip at the very bottom of the map). */
  isWater(x, y) {
    return y > WORLD_H - 26;
  }

  /** All intersection nodes adjacent to (i, j), in-bounds only. */
  neighbors(i, j) {
    const out = [];
    if (i > 0) out.push([i - 1, j]);
    if (i < COLS) out.push([i + 1, j]);
    if (j > 0) out.push([i, j - 1]);
    if (j < ROWS) out.push([i, j + 1]);
    return out;
  }

  /** Snap a world position to the nearest intersection node indices. */
  nearestNode(x, y) {
    return [Math.round(x / TILE), Math.round(y / TILE)];
  }

  /** Lane center for travelling in direction (dx, dy) along the street at index k. */
  lanePoint(i, j, dx, dy) {
    // Right-hand traffic: offset to the right of travel direction (screen coords, y down).
    return { x: i * TILE + (-dy * 12), y: j * TILE + (dx * 12) };
  }

  /**
   * Resolve a circle (x, y, r) against every building it overlaps: returns the pushed-out
   * position and (in out.impact) the deepest penetration found, for crash effects.
   */
  collideCircle(x, y, r, out = {}) {
    let px = x;
    let py = y;
    let impact = 0;
    for (let k = 0; k < this.buildings.length; k += 1) {
      const b = this.buildings[k];
      if (px + r < b.x || px - r > b.x + b.w || py + r < b.y || py - r > b.y + b.h) continue;
      const cx = Math.max(b.x, Math.min(px, b.x + b.w));
      const cy = Math.max(b.y, Math.min(py, b.y + b.h));
      let dx = px - cx;
      let dy = py - cy;
      let d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      let d = Math.sqrt(d2);
      if (d < 0.0001) {
        // Centre inside the rect: push out along the shallowest axis.
        const left = px - b.x;
        const right = b.x + b.w - px;
        const top = py - b.y;
        const bottom = b.y + b.h - py;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { px = b.x - r; dx = -1; dy = 0; }
        else if (m === right) { px = b.x + b.w + r; dx = 1; dy = 0; }
        else if (m === top) { py = b.y - r; dx = 0; dy = -1; }
        else { py = b.y + b.h + r; dx = 0; dy = 1; }
        d = 1;
        impact = Math.max(impact, r);
      } else {
        const push = r - d;
        px += (dx / d) * push;
        py += (dy / d) * push;
        impact = Math.max(impact, push);
      }
    }
    // World bounds.
    if (px < r) { px = r; impact = Math.max(impact, r); }
    if (py < r) { py = r; impact = Math.max(impact, r); }
    if (px > WORLD_W - r) { px = WORLD_W - r; impact = Math.max(impact, r); }
    if (py > WORLD_H - r) { py = WORLD_H - r; impact = Math.max(impact, r); }
    out.impact = impact;
    return { x: px, y: py };
  }

  /** A random point on a sidewalk next to a road, for pedestrian spawns. */
  randomSidewalkPoint(rng) {
    const i = pickInt(rng, 0, COLS - 1);
    const j = pickInt(rng, 0, ROWS - 1);
    const onVertical = chance(rng, 0.5);
    const side = chance(rng, 0.5) ? 1 : -1;
    const along = between(rng, 20, TILE - 20);
    if (onVertical) {
      return { x: i * TILE + side * (ROAD_W / 2 + 5), y: j * TILE + along };
    }
    return { x: i * TILE + along, y: j * TILE + side * (ROAD_W / 2 + 5) };
  }

  /** A random lane position and direction for traffic spawns. */
  randomLanePoint(rng) {
    const i = pickInt(rng, 0, COLS);
    const j = pickInt(rng, 0, ROWS);
    if (chance(rng, 0.5)) {
      const dx = chance(rng, 0.5) ? 1 : -1;
      const p = this.lanePoint(i, j, dx, 0);
      return { x: p.x, y: p.y, dx, dy: 0 };
    }
    const dy = chance(rng, 0.5) ? 1 : -1;
    const p = this.lanePoint(i, j, 0, dy);
    return { x: p.x, y: p.y, dx: 0, dy };
  }

  /** Street name at a world position, for the location readout on the HUD. */
  streetNameAt(x, y) {
    const mx = x % TILE;
    const my = y % TILE;
    const half = ROAD_W / 2;
    const j = Math.round(y / TILE);
    const i = Math.round(x / TILE);
    if (my < half || my > TILE - half) return this.hNames[Math.max(0, Math.min(ROWS, j))] ?? 'Verona Blvd';
    if (mx < half || mx > TILE - half) return this.vNames[Math.max(0, Math.min(COLS, i))] ?? 'Palm Ave';
    return null;
  }
}
