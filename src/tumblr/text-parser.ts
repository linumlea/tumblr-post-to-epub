import type { NormalizedFormatting, RawFormatting } from './types';

export interface TextSegment {
  text: string;
  formatting: NormalizedFormatting[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normFormat(raw: RawFormatting, textLength: number): NormalizedFormatting | undefined {
  const type = typeof raw.type === 'string' ? raw.type : undefined;
  const startRaw = toNumber(raw.start);
  const endRaw = toNumber(raw.end);
  if (!type || startRaw == null || endRaw == null) return undefined;
  const start = clamp(Math.floor(startRaw), 0, textLength);
  const end = clamp(Math.floor(endRaw), 0, textLength);
  if (end <= start) return undefined;
  return {
    type,
    start,
    end,
    url: typeof raw.url === 'string' ? raw.url : undefined,
    blogName: typeof (raw.blog as any)?.name === 'string' ? (raw.blog as any).name : undefined,
    hex: typeof raw.hex === 'string' ? raw.hex : undefined,
    raw,
  };
}

function formatKey(f: NormalizedFormatting): string {
  return [f.type, f.url ?? '', f.blogName ?? '', f.hex ?? ''].join('\u0000');
}

export function normalizeFormatting(raw: unknown, textLength: number): NormalizedFormatting[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedFormatting[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fmt = normFormat(item as RawFormatting, textLength);
    if (fmt) out.push(fmt);
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end || a.type.localeCompare(b.type));
  return out;
}

// NPF formatting ranges are offset-based. JS strings use UTF-16 code units;
// we slice with native indices and do not mutate text by string replacement.
// This keeps overlapping/adjacent ranges stable; renderers must escape text.
export function segmentFormattedText(text: string, formatting: NormalizedFormatting[]): TextSegment[] {
  if (!text) return [];
  const boundaries = new Set<number>([0, text.length]);
  for (const f of formatting) {
    boundaries.add(clamp(f.start, 0, text.length));
    boundaries.add(clamp(f.end, 0, text.length));
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const active = formatting
      .filter((f) => f.start <= start && f.end >= end)
      .sort((a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type));
    const seen = new Set<string>();
    const deduped = active.filter((f) => {
      const k = formatKey(f);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    segments.push({ text: text.slice(start, end), formatting: deduped });
  }
  return segments;
}
