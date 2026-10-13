// GLSL shared by the home tank's water: the simulation, the caustic light on the materials, the light shafts and the
// water/glass composite. Everything is in tank-local metres: x across, z front to back, y up from the tank's floor
// (the bottom glass), the origin at the floor's centre.

/** IOR of the water; the glass panes are thin and parallel, so air -> glass -> water bends as air -> water. */
export const W_IOR = 1.333;

/** The surface and the light bar: every water shader and every material lit by the caustics reads these. */
export const TANK_COMMON = /* glsl */ `
uniform sampler2D uSurf, uCaus;
uniform vec3 uLampPosition, uLampAxis;
uniform vec3 uLampCol;      // the light bar's light
uniform float uCausScale;   // caustics texture -> fraction of the bar's light
uniform float uWaterLevel, uLampHalf, uFloorY;
uniform vec2 uTankHalf;
uniform vec3 uTankOrigin;
uniform vec3 uAbsorb;       // per metre, per channel
uniform float uTime;
const float W_IOR = 1.333;
// water height above the still level and its slope at p
vec3 wave(vec2 p) { return textureLod(uSurf, p / (2.0 * uTankHalf) + 0.5, 0.0).xyz; }
vec3 normalOf(vec3 w) { return normalize(vec3(-w.y, 1.0, -w.z)); }
float fresnel(float c) { return 0.02 + 0.98 * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
// the LED bar above the tank: the direction to its nearest point, and how much of its light arrives (1 right under it)
float lampAt(vec3 p, out vec3 L) {
  vec3 d = uLampPosition + uLampAxis * clamp(dot(p - uLampPosition, uLampAxis), -uLampHalf, uLampHalf) - p;
  float r2 = dot(d, d);
  L = d * inversesqrt(r2);
  return 2.0 / (1.0 + 66.0 * r2) * smoothstep(0.2, 0.6, L.y);
}
// caustics texture coordinates of a floor point
vec2 causUV(vec2 xz) { return xz / (2.0 * uTankHalf) + 0.5; }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

/**
 * The light bar through the moving surface on a standard material: the spot light (the bar, with its shadows) is
 * modulated by the caustic pattern, split a little into its colours by the water's dispersion; a weak share of the
 * pattern is added on top (light scattered in the water), and the sand under the bar lights the bellies from below.
 */
export const CAUSTIC_LIGHT = /* glsl */ `
vec3 tankCaustic(vec3 p) {
  vec2 uv = causUV(p.xz);
  // dispersion: the red light is bent a little less than the blue, so the bright lines fringe outward from the bar
  vec2 away = p.xz - (uLampPosition.xz + uLampAxis.xz * clamp(dot(p.xz - uLampPosition.xz, uLampAxis.xz), -uLampHalf, uLampHalf));
  vec2 k = away / (2.0 * uTankHalf) * 0.007 * clamp(uWaterLevel - p.y, 0.0, 0.4);
  return uCausScale * vec3(texture(uCaus, uv - k).r, texture(uCaus, uv).g, texture(uCaus, uv + k).b);
}
`;

/** The room seen in a reflection or through the surface: the probe plus the bright strip of the bar, drawn sharp. */
export const ROOM_LOOKUP = /* glsl */ `
uniform samplerCube uEnv;
uniform float uEnvLod, uEnvGain, uLampRadiance;
vec3 lampSeen(vec3 p, vec3 dir, float rough) {
  if (dir.y <= 0.001) return vec3(0.0);
  float t = (uLampPosition.y - p.y) / dir.y;
  vec3 q = p + dir * t - uLampPosition;
  vec3 side = normalize(cross(uLampAxis, vec3(0.0, 1.0, 0.0)));
  float ax = dot(q, uLampAxis), sz = dot(q, side);
  float soft = 0.002 + rough * t;
  float strip = smoothstep(soft, -soft, abs(ax) - uLampHalf) * smoothstep(soft, -soft, abs(sz) - 0.007);
  float glow = exp(-length(vec2(max(abs(ax) - uLampHalf, 0.0), sz)) * 28.0);
  return uLampCol * (uLampRadiance * strip + 0.35 * glow);
}
vec3 room(vec3 p, vec3 dir, float rough) {
  return uEnvGain * textureLod(uEnv, dir, rough * uEnvLod).rgb + lampSeen(p, dir, rough);
}
`;

/** Screen-space helpers for the passes drawn over the tank: the opaque scene's depth, projection, box hits. */
export const SCREEN = /* glsl */ `
uniform sampler2D uSceneDepth;
uniform mat4 uInvProj, uProjM, uViewM;
vec3 viewPosAt(vec2 uv) {
  float z = textureLod(uSceneDepth, uv, 0.0).r;
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
// distance from the camera to the opaque scene along the ray through uv
float sceneDist(vec2 uv) { return length(viewPosAt(uv)); }
// screen position of a tank-local point; w > 0 when it is in front of the camera
vec3 projectUV(vec3 pL) {
  vec4 c = uProjM * (uViewM * vec4(pL + uTankOrigin, 1.0));
  return vec3(c.xy / c.w * 0.5 + 0.5, c.w);
}
// entry and exit distances of a ray through an axis-aligned box (entry > exit: a miss)
vec2 boxHit(vec3 o, vec3 d, vec3 lo, vec3 hi) {
  vec3 inv = 1.0 / (d + vec3(equal(d, vec3(0.0))) * 1e-7);
  vec3 a = (lo - o) * inv, b = (hi - o) * inv;
  vec3 n = min(a, b), f = max(a, b);
  return vec2(max(max(n.x, n.y), n.z), min(min(f.x, f.y), f.z));
}
// outward normal of the box face a point on its surface lies on
vec3 boxNormal(vec3 p, vec3 lo, vec3 hi) {
  vec3 q = (p - 0.5 * (lo + hi)) / (0.5 * (hi - lo)), a = abs(q);
  if (a.x >= a.y && a.x >= a.z) return vec3(sign(q.x), 0.0, 0.0);
  if (a.y >= a.z) return vec3(0.0, sign(q.y), 0.0);
  return vec3(0.0, 0.0, sign(q.z));
}
`;

export const BOX_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
