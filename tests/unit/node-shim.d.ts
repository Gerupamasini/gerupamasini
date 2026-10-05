// The project has no @types/node; tests that read built assets only need these two calls.
declare module 'node:fs' {
  interface FileBuffer {
    readUInt32LE(offset: number): number;
    subarray(start: number, end: number): FileBuffer;
    toString(encoding?: string): string;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): FileBuffer;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}
