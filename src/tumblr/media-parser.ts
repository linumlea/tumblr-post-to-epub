import type { JsonObject, MediaCandidate, RawBlock, RawMedia } from './types';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

export function parseMedia(raw: unknown): MediaCandidate | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as RawMedia;
  const url = str(m.url);
  if (!url) return undefined;
  return {
    url,
    declaredType: str(m.type),
    width: num(m.width),
    height: num(m.height),
    poster: parseMedia(m.poster),
    cropped: bool(m.cropped),
    hasOriginalDimensions: bool(m.hasOriginalDimensions),
    mediaKey: str(m.mediaKey),
  };
}

export function parseMediaArray(raw: unknown): MediaCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseMedia).filter((m): m is MediaCandidate => !!m);
}

export function bestMedia(candidates: MediaCandidate[]): MediaCandidate | undefined {
  if (!candidates.length) return undefined;
  const originals = candidates.filter((c) => c.hasOriginalDimensions);
  const pool = originals.length ? originals : candidates;
  return [...pool].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0] ?? candidates[0];
}

export function ignoredEmbedHtml(block: RawBlock): boolean {
  return typeof block.embedHtml === 'string' || typeof block.embed_html === 'string' || typeof block.embedIframe === 'string' || typeof block.embed_iframe === 'string';
}

export function rawAttribution(block: RawBlock): JsonObject | undefined {
  const attr = block.attribution;
  return attr && typeof attr === 'object' && !Array.isArray(attr) ? (attr as JsonObject) : undefined;
}
