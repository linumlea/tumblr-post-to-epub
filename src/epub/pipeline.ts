import { detectMediaType, allowedMediaHost, type BinaryAsset } from '../media/index';
import { assignAssetPaths } from '../media/plan';
import type { MediaPlanItem } from '../media/index';
import type { NormalizedPost } from '../tumblr/types';
import { renderPostDocument } from './xhtml-renderer';
import { packageEpub } from './package';

export interface ExportPipelineResult {
  ok: boolean;
  filename?: string;
  bytes?: Uint8Array;
  warnings: string[];
  diagnostics: string[];
  error?: string;
  errorCode?: string;
}

export async function fetchMediaBytes(item: MediaPlanItem, fetchFn: typeof fetch): Promise<{ asset?: BinaryAsset; warning?: string; diagnostic: string }> {
  let url: URL;
  try { url = new URL(item.url); } catch { return { warning: `Skipped invalid media URL: ${item.url}`, diagnostic: `Invalid URL skipped: ${item.url}` }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { warning: `Skipped non-HTTP media URL: ${item.url}`, diagnostic: `Non-HTTP media skipped: ${item.url}` };
  if (!allowedMediaHost(url)) return { warning: `Skipped non-Tumblr media host: ${url.hostname}`, diagnostic: `Host not allowed for media download: ${url.hostname} (${item.sourcePath})` };

  try {
    const res = await fetchFn(item.url, { method: 'GET', credentials: 'include', cache: 'no-store' });
    if (!res.ok) return { warning: `Media download failed (${res.status}): ${item.url}`, diagnostic: `Download failed ${res.status} ${res.statusText} for ${item.url}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    const detected = detectMediaType(buf, res.headers.get('content-type') || item.declaredType);
    const declared = item.declaredType?.split(';')[0].trim();
    const diag = declared && declared !== detected.type
      ? `Media type corrected ${declared} -> ${detected.type} (${detected.confidence}) for ${item.url}${item.url.includes('.gifv') ? ' [.gifv preserved as actual bytes]' : ''}`
      : `Media ${detected.type} (${detected.confidence}) ${item.url}`;
    return { asset: { path: '', bytes: buf, mediaType: detected.type, sourceUrl: item.url }, diagnostic: diag };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { warning: `Media download error: ${msg}`, diagnostic: `Download error for ${item.url}: ${msg}` };
  }
}

export async function runExportPipeline(post: NormalizedPost, mediaPlan: MediaPlanItem[], fetchFn: typeof fetch = fetch, options: { embedMedia?: boolean } = {}): Promise<ExportPipelineResult> {
  const warnings: string[] = [];
  const diagnostics: string[] = [];
  const downloaded: Array<{ url: string; mediaType: string; bytes: Uint8Array }> = [];
  const byUrl = new Map<string, { url: string; mediaType: string; bytes: Uint8Array }>();

  for (const item of mediaPlan) {
    if (byUrl.has(item.url)) { diagnostics.push(`Deduped media URL: ${item.url}`); continue; }
    const r = await fetchMediaBytes(item, fetchFn);
    diagnostics.push(r.diagnostic);
    if (r.warning) warnings.push(r.warning);
    if (r.asset) {
      const rec = { url: item.url, mediaType: r.asset.mediaType, bytes: r.asset.bytes };
      byUrl.set(item.url, rec);
      downloaded.push(rec);
    }
  }

  const registry = assignAssetPaths(downloaded);
  diagnostics.push(`Packaged ${registry.assets.length}/${mediaPlan.length} planned media asset(s).`);

  const rendered = renderPostDocument(post, {
    resolveMediaUrl: (url) => {
      const p = registry.byUrl.get(url);
      return p ? `../${p.replace(/^\/+/, '')}` : undefined;
    },
    cssHref: '../styles/style.css',
    embedMedia: !!options.embedMedia,
  });
  diagnostics.push(...rendered.diagnostics);
  if (warnings.length) diagnostics.push(`Media warnings: ${warnings.length}`);

  let epub: Uint8Array;
  try {
    epub = packageEpub({
      title: rendered.title,
      filenameBase: rendered.filenameBase,
      xhtml: rendered.xhtml,
      assets: registry.assets,
      sourceUrl: post.canonicalUrl || post.url,
      identifier: post.id ? `tumblr-post-${post.blogName || 'unknown'}-${post.id}` : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, warnings, diagnostics: [...diagnostics, `EPUB packaging failed: ${msg}`], error: msg, errorCode: 'EPUB_GENERATION_FAILED' };
  }

  return {
    ok: true,
    filename: `${rendered.filenameBase}.epub`,
    bytes: epub,
    warnings,
    diagnostics,
  };
}
