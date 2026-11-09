import type { NormalizedPost, NormalizedTrailEntry, NormalizedBlock, MediaCandidate } from '../tumblr/types';
import { extensionForMediaType, sanitizePathSegment, type BinaryAsset, type MediaPlanItem } from './index';
import { bestMedia } from '../tumblr/media-parser';

function pushMedia(out: MediaPlanItem[], url: string | undefined, declaredType: string | undefined, kind: MediaPlanItem['kind'], sourcePath: string): void {
  if (!url || typeof url !== 'string') return;
  try { new URL(url); } catch { return; }
  out.push({ url, declaredType, kind, sourcePath });
}

function pushCandidates(out: MediaPlanItem[], candidates: MediaCandidate[] | undefined, kind: MediaPlanItem['kind'], sourcePath: string): void {
  const chosen = candidates?.length ? bestMedia(candidates) : undefined;
  if (chosen?.url) pushMedia(out, chosen.url, chosen.declaredType, kind, sourcePath);
}

function walkBlocks(blocks: NormalizedBlock[], sourcePath: string, out: MediaPlanItem[]): void {
  blocks.forEach((block, i) => {
    const p = `${sourcePath}/block[${i}]`;
    if (block.kind === 'image') {
      pushCandidates(out, block.media, 'image', p);
    } else if (block.kind === 'audio') {
      const mediaDeclaredType = block.media == null ? undefined : block.media.declaredType;
      const audioMedia = block.media ? [block.media] : (block.url ? [{ url: block.url, declaredType: mediaDeclaredType }] : undefined);
      pushCandidates(out, audioMedia, 'audio', `${p}/media`);
      pushCandidates(out, block.poster, 'poster', `${p}/poster`);
    } else if (block.kind === 'video') {
      const mediaDeclaredType = block.media == null ? undefined : block.media.declaredType;
      const videoMedia = block.media ? [block.media] : (block.url ? [{ url: block.url, declaredType: mediaDeclaredType }] : undefined);
      pushCandidates(out, videoMedia, 'video', `${p}/media`);
      pushCandidates(out, block.poster, 'poster', `${p}/poster`);
      if (!block.poster?.length) pushCandidates(out, block.filmstrip ? [block.filmstrip] : undefined, 'filmstrip', `${p}/filmstrip`);
    }
  });
}

function walkTrail(entries: NormalizedTrailEntry[], out: MediaPlanItem[]): void {
  entries.forEach((entry, i) => walkBlocks(entry.content, `trail[${i}]`, out));
}

export function collectMediaPlan(post: NormalizedPost): MediaPlanItem[] {
  const out: MediaPlanItem[] = [];
  walkBlocks(post.content, 'root', out);
  walkTrail(post.trail, out);
  return out;
}

export interface AssetPathRegistry {
  byUrl: Map<string, string>;
  assets: BinaryAsset[];
}

export function assignAssetPaths(items: Array<{ url: string; mediaType: string; bytes: Uint8Array }>): AssetPathRegistry {
  const byUrl = new Map<string, string>();
  const byPath = new Set<string>();
  const assets: BinaryAsset[] = [];
  let n = 0;
  for (const item of items) {
    if (byUrl.has(item.url)) continue;
    const ext = extensionForMediaType(item.mediaType);
    let base = sanitizePathSegment(`${String(++n).padStart(3, '0')}-${item.mediaType.split('/')[0] || 'asset'}`);
    let path = `assets/${base}.${ext}`;
    let dup = 2;
    while (byPath.has(path)) path = `assets/${base}-${dup++}.${ext}`;
    byPath.add(path);
    byUrl.set(item.url, path);
    assets.push({ path, bytes: item.bytes, mediaType: item.mediaType, sourceUrl: item.url });
  }
  return { byUrl, assets };
}
