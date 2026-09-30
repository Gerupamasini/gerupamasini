// Shared dimensions (metres). The tank's inner floor glass is at y = 0.
export const TANK = {
  w: 1.2, d: 0.55, h: 0.62,          // inner size
  glass: 0.012,
  level: 0.555,                      // water level
  floorRef: 0.07,                    // plane the caustics are computed on (mean sand height)
  ior: 1.333,
};
export const tankMin = () => [-TANK.w / 2, -TANK.d / 2];
export const tankSize = () => [TANK.w, TANK.d];
