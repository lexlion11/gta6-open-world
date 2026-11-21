// localStorage save: auto-saved while playing (position, money, health, wanted,
// mission progress, inventory) and loaded from the start screen's Continue entry.
import { SAVE_KEY } from './config.js';

export function saveGame(game) {
  try {
    const pl = game.player;
    const data = {
      v: 1,
      x: Math.round(pl.x),
      y: Math.round(pl.y),
      health: Math.round(pl.health),
      money: pl.money,
      missionIndex: game.missions.active ? game.missions.index : game.missions.index + 1,
      missionActive: game.missions.active,
      heat: Math.round(game.heat * 10) / 10,
      inventory: game.inventory,
      time: Math.round(game.renderer.time * 1000) / 1000,
      weapon: pl.weapon,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
