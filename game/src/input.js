// Keyboard, mouse and pause input. Keeps a pressed-key set, the aim angle from the
// player to the cursor, and edge-triggered actions consumed once per frame by the game.

export const KEY = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  enter: 'enter', exit: 'exit', punch: 'punch', pause: 'pause', mute: 'mute',
  weapon1: 'weapon1', weapon2: 'weapon2',
};

const BINDINGS = {
  KeyW: KEY.up, ArrowUp: KEY.up,
  KeyS: KEY.down, ArrowDown: KEY.down,
  KeyA: KEY.left, ArrowLeft: KEY.left,
  KeyD: KEY.right, ArrowRight: KEY.right,
  KeyE: KEY.enter, KeyF: KEY.punch, Space: KEY.punch,
  Escape: KEY.pause, KeyP: KEY.pause,
  KeyM: KEY.mute,
  Digit1: KEY.weapon1, Digit2: KEY.weapon2,
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // edge-triggered this frame
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.fired = false;            // edge-triggered shot
    this.anyKey = false;           // edge-triggered any key (start screen)
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = BINDINGS[e.code];
      if (k) {
        this.keys.add(k);
        this.pressed.add(k);
        e.preventDefault();
      }
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => {
      const k = BINDINGS[e.code];
      if (k) this.keys.delete(k);
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.fired = true;
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Consume and clear the one-shot actions; called once per frame by the game. */
  consume() {
    const p = this.pressed;
    this.pressed = new Set();
    const fired = this.fired;
    this.fired = false;
    const anyKey = this.anyKey;
    this.anyKey = false;
    return { pressed: p, fired, anyKey };
  }

  down(key) {
    return this.keys.has(key);
  }
}
