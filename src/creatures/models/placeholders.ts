import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, type Material } from 'three';

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
    const w = mesh(new BoxGeometry(0.05, 0.003, 0.06), back, 'wingMesh', wing);
    w.position.set(side * 0.012, 0, -0.01);
    wing.rotation.z = side * 1.25; // folded against the flank; the driver opens them in flight
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
