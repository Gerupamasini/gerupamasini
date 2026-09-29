// Life-like behaviour for the goby: breathing idle, short swimming bursts with glide, occasional yawns,
// independent eye saccades and body curvature while turning. Clips come from the glTF
// (Idle = base layer, Swim / Yawn = additive layers on top).
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const Y = new THREE.Vector3(0, 1, 0);

function restClipFor(clip, root) {
  const tracks = clip.tracks.map((tr) => {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(tr.name);
    const node = root.getObjectByName(nodeName);
    const v = propertyName === 'quaternion' ? node.quaternion.toArray() : node.position.toArray();
    return new tr.constructor(tr.name, [0], v);
  });
  return new THREE.AnimationClip(`${clip.name}_rest`, 0, tracks);
}

export function createBehavior({ root, bones, clips }) {
  const mixer = new THREE.AnimationMixer(root);
  const byName = Object.fromEntries(clips.map((c) => [c.name, c]));
  const additive = (name) => {
    const clip = byName[name].clone();
    THREE.AnimationUtils.makeClipAdditive(clip, 0, restClipFor(byName[name], root));
    const a = mixer.clipAction(clip);
    a.blendMode = THREE.AdditiveAnimationBlendMode;
    return a;
  };
  const idle = mixer.clipAction(byName.Idle);
  const swimA = additive('Swim');
  const yawnA = additive('Yawn');
  idle.play();
  swimA.setEffectiveWeight(0);
  swimA.play();
  yawnA.setLoop(THREE.LoopOnce, 1);
  yawnA.clampWhenFinished = false;

  const chain = ['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7'].map((n) => bones[n]);
  const eyes = [bones.J_eyeL, bones.J_eyeR].map((bone, i) => ({ bone, cur: new THREE.Quaternion(), goal: new THREE.Quaternion(), timer: 0.3 + i * 0.4 }));
  const st = {
    auto: true, paused: false, mode: 'rest', t: 0, next: 2.5,
    speed: 0, heading: 0, yawRate: 0, swimW: 0, lift: 0, time: 0, dur: 1,
    pos: new THREE.Vector3(), target: new THREE.Vector3(),
  };
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const isYawning = () => yawnA.isRunning();

  function swim() {
    if (isYawning()) return;
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.012 + Math.random() * 0.03;
    st.target.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    if (st.target.distanceTo(st.pos) < 0.015) st.target.multiplyScalar(-1);
    st.mode = 'swim';
    st.t = 0;
    st.dur = 0.8 + Math.random() * 0.8;
  }
  function yawn() {
    if (isYawning() || st.mode === 'swim') return;
    yawnA.reset();
    yawnA.setEffectiveWeight(1);
    yawnA.play();
    st.t = 0;
    st.next = 4 + Math.random() * 3;
  }

  function update(dt) {
    if (st.paused) return;
    st.time += dt;
    st.t += dt;
    if (st.mode === 'rest') {
      st.speed *= Math.exp(-dt * 2.2);
      st.yawRate *= Math.exp(-dt * 3);
      if (st.auto && st.t > st.next && !isYawning()) (Math.random() < 0.3 ? yawn : swim)();
    } else if (st.mode === 'swim') {
      st.speed += (0.055 - st.speed) * (1 - Math.exp(-dt * 5));
      const desired = Math.atan2(st.target.x - st.pos.x, st.target.z - st.pos.z);
      st.yawRate = clamp(wrap(desired - st.heading) * 3, -2.6, 2.6);
      if (st.t > st.dur || st.pos.distanceTo(st.target) < 0.004) { st.mode = 'glide'; st.t = 0; }
    } else if (st.mode === 'glide') {
      st.speed *= Math.exp(-dt * 1.5);
      st.yawRate *= Math.exp(-dt * 3);
      if (st.t > 1.1) { st.mode = 'rest'; st.t = 0; st.next = 3 + Math.random() * 4.5; }
    }
    st.heading += st.yawRate * dt;
    const swimGoal = st.mode === 'swim' ? 1 : 0;
    st.swimW += (swimGoal - st.swimW) * (1 - Math.exp(-dt * (swimGoal ? 8 : 3.5)));
    swimA.setEffectiveWeight(st.swimW);
    swimA.setEffectiveTimeScale(0.55 + 0.8 * clamp(st.speed / 0.055, 0, 1.2));
    st.lift += ((st.mode === 'rest' ? 0 : 1) - st.lift) * (1 - Math.exp(-dt * 1.8));

    st.pos.x += Math.sin(st.heading) * st.speed * dt;
    st.pos.z += Math.cos(st.heading) * st.speed * dt;
    root.position.set(st.pos.x, 0.0009 * Math.sin(st.time * 0.7) + 0.0025 * st.lift, st.pos.z);
    e.set(-0.06 * st.swimW, st.heading, -st.yawRate * 0.05);
    root.quaternion.setFromEuler(e);

    mixer.update(dt);
    // the body curves into turns
    const bend = clamp(-st.yawRate * 0.045, -0.1, 0.1);
    q.setFromAxisAngle(Y, bend);
    for (const b of chain) b.quaternion.multiply(q);
    // independent eye movements
    for (const eye of eyes) {
      eye.timer -= dt;
      if (eye.timer <= 0) {
        eye.goal.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.28, (Math.random() - 0.5) * 0.5, 0));
        eye.timer = 0.35 + Math.random() * 2.4;
      }
      eye.cur.slerp(eye.goal, 1 - Math.exp(-dt * 22));
      eye.bone.quaternion.copy(eye.cur);
    }
  }

  // freeze a clip at a given time (used for reproducible stills: ?anim=yawn:1.0)
  function pose(name, time) {
    const a = { yawn: yawnA, swim: swimA }[name];
    if (!a) return;
    if (name === 'swim') { st.swimW = 1; a.setEffectiveWeight(1); }
    else { a.reset(); a.setEffectiveWeight(1); a.play(); }
    a.time = time;
    a.paused = false;
    mixer.update(0);
    st.paused = true;
  }

  return {
    update,
    swim,
    yawn,
    pose,
    anchor: () => root.position,
    setAuto: (v) => { st.auto = v; },
    setPaused: (v) => { st.paused = v; },
    state: st,
    mixer,
  };
}
