// Port Verona — shared constants. World is a grid city: roads run along tile lines,
// blocks between them hold buildings, parks and landmarks. All sizes in world pixels.

export const TILE = 240;            // distance between road centerlines
export const COLS = 11;             // vertical road count -> world width
export const ROWS = 8;              // horizontal road count -> world height
export const WORLD_W = TILE * COLS; // 2640
export const WORLD_H = TILE * ROWS; // 1920
export const ROAD_W = 48;           // full road width (two lanes)
export const LANE_OFF = 12;         // lane center offset from road centerline (right-hand traffic)
export const SIDEWALK = 9;          // paved band between road edge and block edge

export const STEP = 1 / 60;         // fixed simulation step
export const MAX_FRAME = 0.25;      // longest frame the loop catches up on

// Player on foot
export const PLAYER = {
  speed: 155,
  radius: 9,
  maxHealth: 100,
  punchRange: 30,
  punchDamage: 22,
  punchCooldown: 0.42,
  invulnTime: 2.0,
};

// Cars
export const CAR = {
  width: 34,
  length: 64,
  radius: 26,
  maxSpeed: 330,
  reverseSpeed: 130,
  accel: 300,
  brake: 480,
  engineBrake: 120,
  turn: 2.7,
  grip: 0.92,
  hp: 100,
};

// Traffic / pedestrians
export const TRAFFIC = {
  maxCars: 14,
  maxPeds: 22,
  cruise: 150,
  overtake: 210,
  pedSpeed: 62,
  pedRun: 150,
  spawnMargin: 60,
};

// Police & wanted
export const POLICE = {
  maxCars: 4,
  maxCops: 8,
  carSpeed: 260,
  copSpeed: 132,
  copRange: 320,
  copFireRate: 1.15,
  bulletDamage: 9,
  bulletSpeed: 640,
  carHp: 120,
  copHp: 55,
};

// Wanted: heat rises with crimes, stars are read off heat
export const WANTED = {
  decay: 1.6,        // heat per second when the meter is cooling
  cooldown: 6,       // grace seconds after a crime before decay starts
  stealCar: 10,
  killPed: 14,
  killCop: 18,
  destroyPoliceCar: 26,
  hitCar: 3,
  shootNear: 2,
  starAt: [0, 16, 38, 66, 100, 140],
};

// Weapons
export const WEAPONS = {
  fist: { name: 'Fists', range: 30, damage: 22, cooldown: 0.42, ranged: false },
  pistol: { name: 'Pistol', damage: 26, cooldown: 0.34, bulletSpeed: 720, life: 0.9, spread: 0.03, ammo: Infinity },
};

// Day/night: a full cycle in minutes of real time
export const DAY_MINUTES = 6;
export const START_HOUR = 0.30; // early morning light at a fresh game

// Storage
export const SAVE_KEY = 'portverona.save.v1';
