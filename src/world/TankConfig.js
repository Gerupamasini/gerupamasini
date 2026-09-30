// Aquarium dimensions (metres). A standard 120 × 45 × 50 cm tank —
// comfortably housing a small group of 10–20 cm (TL) comets.
export const TANK = {
  L: 1.2, // x
  D: 0.45, // z
  H: 0.5, // y (glass height)
  water: 0.46, // water surface height
  glass: 0.01,
  gravel: 0.03, // mean substrate depth at the front
};

export const TANK_MIN = { x: -TANK.L / 2, y: 0, z: -TANK.D / 2 };
export const TANK_MAX = { x: TANK.L / 2, y: TANK.water, z: TANK.D / 2 };
