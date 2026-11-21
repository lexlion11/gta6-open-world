// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between three screens: title, play, paused.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|night (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a headless screenshot.
import { MAX_FRAME, STEP } from './config.js';
import { Game, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './game.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = new Game(canvas, seed);

window.addEventListener('resize', () => game.renderer.resize());

if (shot) {
  // Screenshot mode: stage the scene, draw it, signal readiness.
  stageShot(shot, game);
  requestAnimationFrame(() => {
    game.draw();
    requestAnimationFrame(() => {
      game.draw();
      // Report a coarse color fingerprint so a headless harness can verify the frame.
      try {
        const ctx = game.renderer.ctx;
        const samples = [];
        const W = canvas.width / (game.renderer.dpr || 1);
        const H = canvas.height / (game.renderer.dpr || 1);
        for (let y = 0; y < H; y += H / 8) {
          for (let x = 0; x < W; x += W / 10) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            samples.push(`${d[0]},${d[1]},${d[2]}`);
          }
        }
        const uniq = new Set(samples).size;
        console.log(`shotfingerprint ${shot} colors=${uniq} first=${samples[0]} center=${samples[Math.floor(samples.length / 2)]}`);
        // Scene diagnostics: entity counts and HUD-region pixel variance.
        const g = game;
        const hudBottomLeft = ctx.getImageData(10, H - 200, 200, 190).data;
        let hudUniq = 0;
        const seen = new Set();
        for (let i = 0; i < hudBottomLeft.length; i += 4) {
          const k = `${hudBottomLeft[i]},${hudBottomLeft[i + 1]},${hudBottomLeft[i + 2]}`;
          if (!seen.has(k)) { seen.add(k); hudUniq += 1; }
        }
        console.log(`shotdiag ${shot} screen=${g.screen} pos=${Math.round(g.player.x)},${Math.round(g.player.y)} inCar=${!!g.player.inCar} stars=${g.stars()} cars=${g.cars.length} policeCars=${g.cars.filter((c) => c.kind === 'police').length} peds=${g.peds.length} cops=${g.cops.length} enemies=${g.enemies.length} bullets=${g.bullets.length} particles=${g.particles.length} minimapColors=${hudUniq} time=${g.renderer.time.toFixed(2)}`);
      } catch (e) {
        console.log(`shotfingerprint ${shot} failed ${e.message}`);
      }
      window.__shotReady = true;
      if (status) status.textContent = `shot ${shot} ready`;
    });
  });
} else {
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    acc += dt;
    let actions = null;
    while (acc >= STEP) {
      actions = game.input.consume();
      handleScreenInput(actions);
      game.step(STEP, actions);
      acc -= STEP;
    }
    game.draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Screen transitions and one-shot keys that live outside the simulation. */
function handleScreenInput(actions) {
  if (!actions) return;
  if (actions.pressed.has('mute')) {
    game.muted = !game.muted;
    game.sound.setMuted(game.muted);
    return;
  }
  if (game.screen === SCREEN_TITLE) {
    if (actions.pressed.has('pause') || actions.pressed.has('mute')) return;
    if (actions.pressed.has('enter') && game.hasSave) {
      game.continueGame();
    } else if (actions.anyKey || actions.pressed.size > 0) {
      if (!actions.pressed.has('enter')) game.newGame();
    }
    return;
  }
  if (game.screen === SCREEN_PLAY && actions.pressed.has('pause')) {
    game.screen = SCREEN_PAUSED;
    game.sound.engineStop();
    game.sound.sirenStop();
    return;
  }
  if (game.screen === SCREEN_PAUSED) {
    if (actions.pressed.has('pause')) game.screen = SCREEN_PLAY;
    return;
  }
}
