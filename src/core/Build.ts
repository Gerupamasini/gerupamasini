/** Build identity injected at compile time (see vite.config.ts). */
export const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : '',
  builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : '',
} as const;

/** "v0.3.0" — the label shown to players. */
export const versionLabel = `v${BUILD.version}`;
/** "v0.3.0 (7f0c139)" — the label with the commit, for bug reports and deploy checks. */
export const buildLabel = BUILD.commit ? `${versionLabel} (${BUILD.commit})` : versionLabel;
