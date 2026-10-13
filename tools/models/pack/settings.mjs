// What the packer does to a model, as one string: a packed file made under other settings is stale.
// Change it whenever the encoding below changes, then run `npm run models:pack` (every model is packed again).
//   textures: KTX2 / Basis UASTC (pack level 1), Zstandard, full mip chain; normal maps with basisu's normal-map
//             preset, colour textures perceptual + sRGB, data textures linear
//   geometry: EXT_meshopt_compression, lossless (no filters), every buffer view on its own
export const PACK_SETTINGS = 'uastc1-zstd-mips+meshopt-v0/1';

/** Masters (what the model builders write) and their packed copies (what the game loads), relative to the repo. */
export const MASTER_DIR = 'src/assets/models';
export const PACKED_DIR = 'src/assets/models-packed';
export const MANIFEST = 'src/assets/models-packed/manifest.json';

/** A texture whose decoded pixels fall under this PSNR (dB) against the master fails the pack. */
export const MIN_PSNR = 30;
