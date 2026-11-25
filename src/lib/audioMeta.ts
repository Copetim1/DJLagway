/**
 * Reads duration and tags from an audio file with music-metadata.
 *
 * music-metadata is ESM-only, and this backend compiles to CommonJS, where TypeScript
 * rewrites `await import(...)` into `require(...)`. Building the import through Function
 * keeps it a real dynamic import, which can load ESM from CommonJS on any supported Node.
 * Jest can't run that, so the tests mock this module.
 */

export interface AudioMetadata {
  /** Seconds, or undefined if the file could not be timed. */
  duration?: number;
  title?: string;
  artist?: string;
  album?: string;
}

// Only the parts of music-metadata's API this file uses.
type MusicMetadata = {
  parseFile(
    filePath: string,
    options?: { duration?: boolean },
  ): Promise<{
    format: { duration?: number };
    common: { title?: string; artist?: string; album?: string };
  }>;
};

const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<MusicMetadata>;

let musicMetadata: Promise<MusicMetadata> | undefined;

/** Throws if the file is not audio music-metadata can parse. */
export async function readAudioMetadata(filePath: string): Promise<AudioMetadata> {
  musicMetadata ??= importEsm('music-metadata');
  const { parseFile } = await musicMetadata;

  // duration: true scans the whole file when the header has no length,
  // which variable-bitrate MP3s often lack.
  const { format, common } = await parseFile(filePath, { duration: true });
  return {
    duration: format.duration,
    title: common.title,
    artist: common.artist,
    album: common.album,
  };
}
