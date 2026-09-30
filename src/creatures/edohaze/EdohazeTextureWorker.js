// Off-main-thread generation of full-resolution Edohaze skin maps.
import { generateData } from './EdohazeTextures.js';

self.onmessage = (e) => {
  const { seed, slMm, W, H } = e.data;
  const d = generateData(seed, slMm, W, H);
  self.postMessage(d, [d.col.buffer, d.nrm.buffer, d.orm.buffer]);
};
