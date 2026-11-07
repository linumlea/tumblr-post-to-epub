import type { NormalizedLayout, RawLayoutBlock, UnknownObservation } from './types';

function asNumberArray(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const nums = v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return nums.length ? nums : [];
}

function parseDisplay(display: unknown): Array<{ blocks: number[] }> {
  if (!Array.isArray(display)) return [];
  const out: Array<{ blocks: number[] }> = [];
  for (const item of display) {
    if (Array.isArray(item)) {
      const blocks = asNumberArray(item);
      if (blocks) out.push({ blocks });
      continue;
    }
    if (item && typeof item === 'object') {
      const blocks = asNumberArray((item as { blocks?: unknown }).blocks);
      if (blocks) out.push({ blocks });
    }
  }
  return out;
}

export function parseLayoutBlock(raw: RawLayoutBlock, path: string, unknowns: UnknownObservation[]): NormalizedLayout {
  const type = typeof raw.type === 'string' ? raw.type : '';
  if (type === 'rows') {
    return {
      type: 'rows',
      displays: parseDisplay(raw.display),
      truncateAfter: typeof raw.truncateAfter === 'number' ? raw.truncateAfter : undefined,
      raw,
    };
  }
  if (type === 'ask') {
    return {
      type: 'ask',
      blocks: asNumberArray(raw.blocks) ?? [],
      attribution: raw.attribution && typeof raw.attribution === 'object' ? (raw.attribution as any) : undefined,
      raw,
    };
  }
  if (type === 'condensed') {
    return {
      type: 'condensed',
      blocks: asNumberArray(raw.blocks) ?? [],
      truncateAfter: typeof raw.truncateAfter === 'number' ? raw.truncateAfter : undefined,
      raw,
    };
  }
  unknowns.push({ path, type: `layout:${type || 'missing'}`, keys: Object.keys(raw) });
  return { type: 'unknown', originalType: type || 'missing', raw };
}

export function parseLayouts(raw: unknown, basePath: string, unknowns: UnknownObservation[]): NormalizedLayout[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => parseLayoutBlock((item ?? {}) as RawLayoutBlock, `${basePath}[${i}]`, unknowns));
}
