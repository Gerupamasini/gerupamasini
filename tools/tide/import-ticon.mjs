// Refresh the small station files from the credited source snapshots; no runtime database dependency.
import { readFile, writeFile } from 'node:fs/promises';
import { CONSTITUENTS } from '../../src/tide/constituents.ts';
const names = Object.keys(CONSTITUENTS);
// EP2 (eps2) and MNS2 share the 227.655 Doodson line; sigma1 is published as SGM.
const aliases = { SGM: 'sigma1', EP2: 'MNS2' };
for (const [id, suffix, ja] of [['jma_tokyo', 'tokyo-ma15-jpn-jodc_jma', '東京'], ['jma_yokosuka', 'yokosuka-hd08-jpn-jodc_jcg', '横須賀']]) {
  const raw = JSON.parse(await readFile(`docs/research/tide/${suffix}.json`, 'utf8'));
  const constituents = raw.harmonic_constituents.map(c => ({ name: aliases[c.name] ?? names.find(n => n.toUpperCase() === c.name), amplitude_cm: c.amplitude * 100, phase_deg: c.phase })).filter(c => c.name);
  const station = {
    id, names: { ja, en: raw.name }, lat: raw.latitude, lon: raw.longitude,
    phaseReference: 'UTC', mslAboveChartDatum_cm: null, constituents,
    source: {
      name: `TICON-4 ${ja}（実測潮位由来）`, url: raw.source.url,
      note: `${raw.attribution} ゲームでは${constituents.length}/50分潮を使用（名称・単位を変換、未対応の微小分潮を省略）。潮位0cmは平均海面で、気象庁潮位表の基準面とは異なります。東京は2020年の公式表16日で潮位変動と干潮時刻を検証。横須賀は公式表との照合未実施。気象・高潮は含みません。`,
    },
  };
  await writeFile(`public/data/tide/stations/${id}.json`, JSON.stringify(station, null, 2) + '\n');
}
