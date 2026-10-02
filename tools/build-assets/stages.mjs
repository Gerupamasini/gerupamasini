// Life-stage parameter sets. 'parr' = pooled photo statistics (mostly parr/juvenile, assets/src/params.json as is).
// 'adult' = ONE scaled adult individual (photo a01, SL 243.2 mm); see assets/src/stage_adult.json. Browser-safe (pure).
export function applyStage(params, stageData, stage = 'adult') {
  if (stage === 'parr' || !stageData) return params;
  const p = structuredClone(params);
  const a = stageData;
  p.silhouette = { ...p.silhouette, s: a.silhouette.s, dorsal: a.silhouette.dorsal, ventral: a.silhouette.ventral, src: 'stage_adult.json (a01, n=1)' };
  p.head_length_over_sl = { ...p.head_length_over_sl, v: a.head_length_over_sl, prov: 'P(n=1)' };
  p.eye = { ...p.eye };
  p.eye.outer_d_over_sl = { ...p.eye.outer_d_over_sl, v: a.eye_outer_d_over_sl, prov: 'P(n=1)' };
  p.eye.center_s = { ...p.eye.center_s, v: a.snout_len_over_hl * a.head_length_over_sl + a.eye_outer_d_over_sl / 2, prov: 'P(n=1)+E' };
  p.mouth = { ...p.mouth, corner_s: { ...p.mouth.corner_s, v: 0.483 * a.head_length_over_sl, prov: 'P(maxilla/HL 0.483 n=25)+P(HL n=1)' } };
  p.operculum = { edge_s: { v: a.head_length_over_sl, prov: 'P(n=1)' } };
  const f = a.fins; const F = p.fins;
  F.dorsal = { ...F.dorsal, origin_s: f.dorsal_origin_s, base_len: f.dorsal_base_len, height: F.dorsal.height };
  F.adipose = { ...F.adipose, origin_s: f.adipose_origin_s, base_len: f.adipose_base_len };
  F.pectoral = { ...F.pectoral, origin_s: f.pectoral_origin_s, length: Math.max(f.pectoral_length, F.pectoral.length * 0.9) };
  F.pelvic = { ...F.pelvic, origin_s: f.pelvic_origin_s, length: Math.max(f.pelvic_length, F.pelvic.length * 0.9) };
  F.anal = { ...F.anal, origin_s: f.anal_origin_s, base_len: f.anal_base_len };
  F.caudal = { ...F.caudal, length: Math.max(f.caudal_length, F.caudal.length * 0.9), span: f.caudal_span, fork_depth: f.caudal_fork_depth };
  p.stage = 'adult';
  return p;
}
