// 脚の IK と歩容：足先を地面に固定し、交互に踏み替える
import * as THREE from 'three';

const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

/**
 * legs[i]: { hip, F, K, D, a, b, dl, dAng, baseYaw, restLocal, group, foot, valid, stepping, t, from, to }
 * a: 長節, b: 腕節＋前節, dl: 指節の弦長, dAng: 指節の曲がり
 */
export class LegRig {
  constructor(body, legs, opts) {
    this.body = body;
    this.legs = legs;
    this.phiD = opts.phiD ?? 1.1;          // 指節の地面に対する角度
    this.stepTime = opts.stepTime ?? 0.14;
    this.stepH = opts.stepH ?? 0.05;
    this.stepThresh = opts.stepThresh ?? 0.08;
    this.yawRange = opts.yawRange ?? 1.0;
    this.footLift = opts.footLift ?? 0.004;
    this.active = true;
  }

  reset() { for (const l of this.legs) { l.valid = false; l.stepping = false; } }

  // 足を畳む（巣穴に入る・遠景）
  fold(k) {
    for (const l of this.legs) {
      l.hip.rotation.y = l.baseYaw;
      l.F.rotation.z = THREE.MathUtils.lerp(0.4, 1.1, k);
      l.K.rotation.z = THREE.MathUtils.lerp(-1.3, -2.3, k);
      l.D.rotation.z = THREE.MathUtils.lerp(-0.6, -1.2, k);
      l.valid = false;
    }
  }

  update(dt, world, vel, moving) {
    const body = this.body;
    body.updateWorldMatrix(true, false);
    _inv.copy(body.matrixWorld).invert();
    // 同じ組の脚だけが同時に踏み出せる（交互歩容）
    let busy0 = 0, busy1 = 0;
    for (const l of this.legs) if (l.stepping) { if (l.group) busy1++; else busy0++; }
    const speed = vel ? Math.hypot(vel.x, vel.z) : 0;
    const stepTime = this.stepTime / clamp(speed * 2.5, 0.8, 1.6);
    for (const l of this.legs) {
      _w.copy(l.restLocal).applyMatrix4(body.matrixWorld);
      _w.y = world.heightAt(_w.x, _w.z) + this.footLift;
      if (!l.valid) { l.foot.copy(_w); l.valid = true; l.stepping = false; }
      if (l.stepping) {
        l.t += dt / stepTime;
        const t = Math.min(1, l.t);
        const e = t * t * (3 - 2 * t);
        l.foot.lerpVectors(l.from, l.to, e);
        l.foot.y += Math.sin(Math.PI * t) * this.stepH;
        if (t >= 1) { l.stepping = false; l.foot.copy(l.to); if (l.group) busy1--; else busy0--; }
      } else {
        const d = Math.hypot(l.foot.x - _w.x, l.foot.z - _w.z);
        const th = moving ? this.stepThresh : this.stepThresh * 0.35;
        const otherBusy = l.group ? busy0 : busy1;
        if (d > th && otherBusy === 0) {
          l.stepping = true; l.t = 0;
          l.from.copy(l.foot);
          l.to.copy(_w);
          if (vel && moving) { l.to.x += vel.x * stepTime * 0.9; l.to.z += vel.z * stepTime * 0.9; }
          l.to.y = world.heightAt(l.to.x, l.to.z) + this.footLift;
          if (l.group) busy1++; else busy0++;
        }
      }
      this.solve(l);
    }
  }

  solve(l) {
    // 足先を体の座標系へ
    _v.copy(l.foot).applyMatrix4(_inv).sub(l.hip.position);
    let yaw = Math.atan2(-_v.z, _v.x);
    const dy0 = angDiff(l.baseYaw, yaw);
    yaw = l.baseYaw + clamp(dy0, -this.yawRange, this.yawRange);
    l.hip.rotation.y = yaw;
    const h = Math.hypot(_v.x, _v.z) - (l.cox || 0);   // 底節の分だけ関節が外にある
    const dy = _v.y;
    // 指節の分を差し引いた足首位置
    const cd = Math.cos(this.phiD), sd = Math.sin(this.phiD);
    const ha = h - l.dl * cd, dya = dy + l.dl * sd;
    const a = l.a, b = l.b;
    const dist = clamp(Math.hypot(ha, dya), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const phi = Math.atan2(dya, ha);
    const alpha = Math.acos(clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1));
    const beta = Math.acos(clamp((a * a + b * b - dist * dist) / (2 * a * b), -1, 1));
    const t1 = phi + alpha;           // 膝を上に
    const t2 = -(Math.PI - beta);
    const t3 = (-this.phiD + l.dAng) - (t1 + t2);
    l.F.rotation.z = t1;
    l.K.rotation.z = t2;
    l.D.rotation.z = t3;
  }
}
