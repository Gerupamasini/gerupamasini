/** Build identity injected at compile time (see vite.config.ts). */
export const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : '',
  /** deploy number: the GitHub Actions run number, '' for a local build */
  build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '',
  builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : '',
} as const;

export interface BuildInfo {
  version: string;
  commit: string;
  build: string;
  builtAt: string;
}

/** "v0.4.0" — the label shown to players. */
export const versionLabel = `v${BUILD.version}`;
/** "v0.4.0 build 9 (08b3d4e)" — the label with the deploy number and the commit, for bug reports and deploy checks. */
export const buildLabel = [versionLabel, BUILD.build ? `build ${BUILD.build}` : '', BUILD.commit ? `(${BUILD.commit})` : ''].filter(Boolean).join(' ');

/** "10/2 17:07" (JST) — when this build was made. */
export function builtAtLabel(info: { builtAt: string } = BUILD): string {
  const t = Date.parse(info.builtAt);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Ask the server which build it is serving now (version.json, never from the cache). Returns that build when
 * it differs from the one running here — the page was loaded from a stale cache, or a deploy landed since.
 */
export async function checkForNewBuild(): Promise<BuildInfo | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const info = (await res.json()) as Partial<BuildInfo>;
    if (typeof info.commit !== 'string') return null;
    const same = info.commit === BUILD.commit && (info.build ?? '') === BUILD.build;
    return same ? null : { version: info.version ?? '', commit: info.commit, build: info.build ?? '', builtAt: info.builtAt ?? '' };
  } catch {
    return null;
  }
}
