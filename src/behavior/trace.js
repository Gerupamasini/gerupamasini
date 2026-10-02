// ExplainTrace (04 §4.7): ring buffer of TraceEntry records answering "why here / why this heading / why now".
export class Trace {
  constructor(fishId, cap = 256) { this.fishId = fishId; this.cap = cap; this.entries = []; }
  add(e) { e.fishId = this.fishId; this.entries.push(e); if (this.entries.length > this.cap) this.entries.shift(); return e; }
  last(n = 5) { return this.entries.slice(-n); }
}

const pct = (x) => (x * 100).toFixed(0);
/** One-paragraph human-readable explanation. E / PROXY dependencies are marked with `*` and `†`. */
export function explain(e) {
  const mark = (p) => `${p.name}=${+p.value.toFixed(3)}${p.prov === 'E' ? '*' : ''}${p.proxy ? '†' + p.proxy : ''}`;
  const L = [];
  L.push(`[${e.t.toFixed(1)}s] ${e.state.from} → ${e.state.to}${e.state.interrupt ? ' (interrupt)' : ''}  dwell ${e.state.dwell_s.toFixed(1)}s`);
  if (e.why_now) { const w = e.why_now; L.push(`  why now: ${w.trigger}${w.targetId ? ' ' + w.targetId : ''} at ${w.dist_m.toFixed(2)} m, ${w.thresholdName}=${+w.thresholdValue.toFixed(2)}${w.p_roll != null ? `, roll ${w.p_roll.toFixed(2)}` : ''}`); }
  if (e.candidates?.length) L.push('  utility: ' + e.candidates.map((c) => `${c.state} ${c.S.toFixed(2)}${c.momentumApplied ? '(+mom)' : ''}`).join(' | '));
  if (e.why_heading) L.push(`  heading: ${e.why_heading.source}, err ${e.why_heading.headingErr_deg.toFixed(0)}°`);
  if (e.why_here) L.push(`  here: u=${e.why_here.u_cms.toFixed(0)} cm/s, height ${e.why_here.heightBD.toFixed(2)} BD, cover ${e.why_here.coverDist_m.toFixed(2)} m`);
  L.push(`  needs F ${pct(e.needs.F)}% H ${pct(e.needs.H)}% | env u ${(e.env.u_local * 100).toFixed(0)} cm/s, ${e.env.temp_C}°C`);
  if (e.paramsUsed?.length) L.push('  params: ' + e.paramsUsed.map(mark).join(', ') + '   (* = engineering value, † = other species)');
  return L.join('\n');
}
