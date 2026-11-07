import type { BodyLocation, ExtractionResult, PostMatchInput, SanitizedPost, SanitizedTrailEntry } from './extract-types';
import type { JsonObject, JsonValue, RawPostObject } from './types';
import { deriveMatchInput, matchViewedPost } from './post-match';
import { parseSanitizedPost } from './parser';

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeBlog(blog: unknown): JsonObject | undefined {
  if (!blog || typeof blog !== 'object') return undefined;
  const b = blog as Record<string, JsonValue | undefined>;
  const keep: JsonObject = {};
  for (const key of ['name', 'title', 'url', 'uuid', 'descriptionNpf', 'blogViewUrl', 'avatar']) {
    if (key in b) keep[key] = b[key];
  }
  return Object.keys(keep).length ? cloneJson(keep) : undefined;
}

function sanitizeTrailEntry(entry: unknown): SanitizedTrailEntry | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const e = entry as Record<string, unknown>;
  return {
    blog: sanitizeBlog(e.blog),
    post: e.post && typeof e.post === 'object' ? cloneJson(e.post as JsonObject) : undefined,
    content: asArray(e.content).map((b) => cloneJson(b as JsonObject)),
    layout: asArray(e.layout).map((b) => cloneJson(b as JsonObject)),
    brokenBlogName: typeof e.brokenBlogName === 'string' ? e.brokenBlogName : undefined,
  };
}

export function sanitizePost(post: RawPostObject): SanitizedPost {
  const p = post as Record<string, unknown>;
  const sanitized: SanitizedPost = {};
  for (const key of [
    'objectType', 'type', 'originalType', 'isBlocksPostFormat', 'id', 'idString', 'blogName', 'postUrl', 'parentPostUrl',
    'canonicalUrl', 'slug', 'date', 'timestamp', 'state', 'tags', 'tagsV2', 'summary', 'sourceUrl', 'sourceTitle',
    'askingName', 'askingUrl', 'rebloggedFromId', 'rebloggedFromUrl', 'rebloggedFromName', 'rebloggedFromUuid',
    'rebloggedRootId', 'rebloggedRootUrl', 'rebloggedRootName', 'rebloggedRootUuid', 'communityLabels', 'isNsfw', 'classification',
  ]) {
    if (key in p) (sanitized as Record<string, unknown>)[key] = cloneJson(p[key]);
  }
  sanitized.blog = sanitizeBlog(p.blog);
  sanitized.content = asArray(p.content).map((b) => cloneJson(b as JsonObject));
  sanitized.layout = asArray(p.layout).map((b) => cloneJson(b as JsonObject));
  sanitized.trail = asArray(p.trail).map(sanitizeTrailEntry).filter((t): t is SanitizedTrailEntry => !!t);
  return sanitized;
}

export function detectBodyLocation(post: Pick<SanitizedPost, 'content' | 'trail'>): BodyLocation {
  const root = asArray(post.content).length > 0;
  const trail = asArray(post.trail).some((t) => asArray((t as SanitizedTrailEntry).content).length > 0);
  if (root && trail) return 'root+trail';
  if (root) return 'root';
  if (trail) return 'trail';
  return 'none';
}

export function collectPostObjects(value: unknown, path = '$', scriptIndex = -1, out: Array<{ path: string; scriptIndex: number; posts: RawPostObject[] }> = [], seen = new WeakSet<object>(), seenPosts = new WeakSet<object>()): Array<{ path: string; scriptIndex: number; posts: RawPostObject[] }> {
  if (!value || typeof value !== 'object') return out;
  if (seen.has(value as object)) return out;
  seen.add(value as object);

  if (Array.isArray(value)) {
    const posts = value.filter((item): item is RawPostObject => !!item && typeof item === 'object' && (item as RawPostObject).objectType === 'post' && !seenPosts.has(item as object));
    if (posts.length) {
      posts.forEach((p) => seenPosts.add(p as object));
      out.push({ path, scriptIndex, posts });
    }
    value.forEach((item, i) => collectPostObjects(item, `${path}[${i}]`, scriptIndex, out, seen, seenPosts));
    return out;
  }

  const record = value as Record<string, unknown>;
  if (record.objectType === 'post' && !seenPosts.has(record)) {
    seenPosts.add(record);
    out.push({ path, scriptIndex, posts: [record as RawPostObject] });
  }
  for (const [key, child] of Object.entries(record)) collectPostObjects(child, `${path}.${key}`, scriptIndex, out, seen, seenPosts);
  return out;
}

export function extractViewedPostFromPage(rawPage: unknown, input: PostMatchInput): ExtractionResult {
  const diagnostics: string[] = [];
  const groups = collectPostObjects(rawPage);
  const posts = groups.flatMap((g) => g.posts);
  diagnostics.push(`Discovered ${posts.length} post object(s) in ${groups.length} location(s).`);
  for (const g of groups) diagnostics.push(`Candidate group ${g.path} (script ${g.scriptIndex}) has ${g.posts.length} post(s).`);
  const match = matchViewedPost(posts, input);
  if ('error' in match) {
    return { ok: false, source: 'embedded-json', viewedUrl: input.viewedUrl, candidatesCount: posts.length, diagnostics: [...diagnostics, ...match.diagnostics], error: match.error };
  }
  const post = sanitizePost(match.matched);
  const parsed = parseSanitizedPost(post);
  diagnostics.push(...match.diagnostics, `Matched post via: ${match.reason}`, ...parsed.diagnostics);
  const result: ExtractionResult = {
    ok: true,
    source: 'embedded-json',
    viewedUrl: input.viewedUrl,
    post,
    normalizedPost: parsed.post,
    bodyLocation: detectBodyLocation(post),
    candidatesCount: posts.length,
    diagnostics,
  };
  return result;
}

export function summarizeExtraction(result: ExtractionResult) {
  const normalized = result.normalizedPost;
  return {
    ok: result.ok,
    source: result.source,
    viewedUrl: result.viewedUrl,
    postId: result.post?.idString ?? (result.post?.id != null ? String(result.post.id) : undefined),
    blogName: result.post?.blogName,
    canonicalUrl: result.post?.canonicalUrl ?? result.post?.postUrl,
    bodyLocation: result.bodyLocation,
    candidatesCount: result.candidatesCount,
    diagnostics: result.diagnostics,
    error: result.error,
    post: result.post,
    normalized: normalized ? {
      id: normalized.id,
      blogName: normalized.blogName,
      tags: normalized.tags,
      contentKinds: normalized.content.map((b) => b.kind),
      trailCount: normalized.trail.length,
      trail: normalized.trail.map((t) => ({ blogName: t.blogName, contentKinds: t.content.map((b) => b.kind), layoutTypes: t.layout.map((l) => l.type) })),
      layoutTypes: normalized.layout.map((l) => l.type),
      unknownCount: normalized.unknowns.length,
    } : undefined,
  };
}

export { deriveMatchInput, matchViewedPost };
