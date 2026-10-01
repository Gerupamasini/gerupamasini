import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, type Material } from 'three';

/** Named parts the placeholder drivers animate. */
export interface PlaceholderModel {
  root: Group;
  parts: Record<string, Object3D>;
  /** total length of the model at scale 1 (metres) */
  length: number;
}

function mesh(geo: ConstructorParameters<typeof Mesh>[0], mat: Material, name: string, parent: Object3D): Mesh {
  const m = new Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** シラタエビ placeholder: 60 mm shrimp, +Z forward, +Y up, origin at the ground under the body. */
export function makeShrimp(): PlaceholderModel {
  const root = new Group();
  root.name = 'Shrimp_Placeholder';
  const body = new MeshStandardMaterial({ color: 0xdcd6c8, roughness: 0.45, transparent: true, opacity: 0.72, metalness: 0 });
  const dark = new MeshStandardMaterial({ color: 0x8a8378, roughness: 0.6 });
  const parts: Record<string, Object3D> = {};
  const L = 0.06;
  const pivot = new Group();
  pivot.position.y = 0.006;
  root.add(pivot);
  parts.pivot = pivot;
  // carapace
  const cara = mesh(new CapsuleGeometry(0.0045, 0.014, 4, 8), body, 'carapace', pivot);
  cara.rotation.x = Math.PI / 2;
  cara.position.z = 0.012;
  // rostrum
  const ros = mesh(new ConeGeometry(0.0012, 0.009, 6), body, 'rostrum', pivot);
  ros.rotation.x = Math.PI / 2;
  ros.position.set(0, 0.003, 0.024);
  // abdomen: 6 segments hinged in a chain
  let parent: Object3D = pivot;
  let zOff = 0.004;
  for (let i = 0; i < 4; i++) {
    const seg = new Group();
    seg.name = `abd${i}`;
    seg.position.z = zOff;
    parent.add(seg);
    const r = 0.0042 - i * 0.0006;
    const m = mesh(new CylinderGeometry(r * 0.85, r, 0.0087, 8), body, `abdMesh${i}`, seg);
    m.rotation.x = Math.PI / 2;
    m.position.z = -0.0045;
    parts[`abd${i}`] = seg;
    parent = seg;
    zOff = -0.0087;
  }
  // tail fan
  const fan = new Group();
  fan.position.z = -0.006;
  parent.add(fan);
  for (const [i, ang] of [-0.5, 0, 0.5].entries()) {
    const f = mesh(new BoxGeometry(0.004, 0.0006, 0.008), body, `fan${i}`, fan);
    f.rotation.y = ang;
    f.position.set(Math.sin(ang) * 0.004, 0, -0.004);
  }
  parts.fan = fan;
  // walking legs: 5 pairs
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
    const leg = new Group();
    leg.name = `leg${i}${side > 0 ? 'L' : 'R'}`;
    leg.position.set(side * 0.004, -0.002, 0.018 - i * 0.006);
    pivot.add(leg);
    const seg = mesh(new CylinderGeometry(0.0004, 0.0003, 0.009, 4), dark, 'legSeg', leg);
    seg.rotation.z = side * 0.9;
    seg.position.set(side * 0.003, -0.003, 0);
    parts[leg.name] = leg;
  }
  // antennae
  for (const side of [-1, 1]) {
    const ant = mesh(new CylinderGeometry(0.0003, 0.0001, 0.05, 4), dark, `antenna${side > 0 ? 'L' : 'R'}`, pivot);
    ant.rotation.x = -Math.PI / 2 + 0.2;
    ant.rotation.z = side * 0.25;
    ant.position.set(side * 0.002, 0.004, 0.045);
    parts[ant.name] = ant;
  }
  // eyes
  for (const side of [-1, 1]) {
    const eye = mesh(new SphereGeometry(0.0011, 8, 6), dark, 'eye', pivot);
    eye.position.set(side * 0.0035, 0.004, 0.02);
  }
  return { root, parts, length: L };
}

/** シロチドリ placeholder: 170 mm plover, +Z forward, +Y up, origin at the feet. */
export function makePlover(): PlaceholderModel {
  const root = new Group();
  root.name = 'Plover_Placeholder';
  const back = new MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.8 });
  const belly = new MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 });
  const black = new MeshStandardMaterial({ color: 0x2a2520, roughness: 0.7 });
  const parts: Record<string, Object3D> = {};
  const body = new Group();
  body.name = 'body';
  body.position.y = 0.075;
  root.add(body);
  parts.body = body;
  const torso = mesh(new SphereGeometry(0.03, 12, 10), back, 'torso', body);
  torso.scale.set(0.75, 0.7, 1.35);
  const under = mesh(new SphereGeometry(0.028, 12, 10), belly, 'belly', body);
  under.scale.set(0.72, 0.62, 1.3);
  under.position.y = -0.008;
  // tail
  const tail = mesh(new BoxGeometry(0.03, 0.004, 0.03), back, 'tail', body);
  tail.position.set(0, 0.004, -0.045);
  tail.rotation.x = 0.25;
  // wings
  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.name = side > 0 ? 'wingL' : 'wingR';
    wing.position.set(side * 0.016, 0.012, 0.005);
    body.add(wing);
    const w = mesh(new BoxGeometry(0.06, 0.003, 0.05), back, 'wingMesh', wing);
    w.position.x = side * 0.03;
    parts[wing.name] = wing;
  }
  // neck + head
  const neck = new Group();
  neck.name = 'neck';
  neck.position.set(0, 0.016, 0.03);
  body.add(neck);
  parts.neck = neck;
  const head = mesh(new SphereGeometry(0.016, 10, 8), belly, 'head', neck);
  head.position.set(0, 0.018, 0.012);
  const cap = mesh(new SphereGeometry(0.0155, 10, 8), back, 'cap', neck);
  cap.position.set(0, 0.021, 0.011);
  cap.scale.set(1, 0.6, 1);
  const beak = mesh(new ConeGeometry(0.003, 0.016, 6), black, 'beak', neck);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.016, 0.034);
  const band = mesh(new BoxGeometry(0.012, 0.006, 0.006), black, 'band', neck);
  band.position.set(0, 0.012, 0.024);
  for (const side of [-1, 1]) {
    const eye = mesh(new SphereGeometry(0.0025, 6, 6), black, 'eye', neck);
    eye.position.set(side * 0.011, 0.022, 0.02);
  }
  // legs
  for (const side of [-1, 1]) {
    const leg = new Group();
    leg.name = side > 0 ? 'legL' : 'legR';
    leg.position.set(side * 0.009, 0.072, -0.002);
    root.add(leg);
    const l = mesh(new CylinderGeometry(0.0022, 0.0018, 0.07, 5), black, 'legMesh', leg);
    l.position.y = -0.035;
    const foot = mesh(new BoxGeometry(0.014, 0.002, 0.016), black, 'foot', leg);
    foot.position.set(0, -0.071, 0.004);
    parts[leg.name] = leg;
  }
  return { root, parts, length: 0.17 };
}
