import type { CandidatePostSummary, PostMatchInput, PostMatchResult } from './extract-types';
import type { RawPostObject } from './types';

function digits(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== 'string') return undefined;
  const match = value.match(/\d{5,}/);
  return match?.[0];
}

function normUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
}

function extractIdFromUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const patterns = [
    /\/post\/(\d{5,})/i,
    /\/(\d{5,})(?:[/?#]|$)/,
    /[?&]post=(\d{5,})/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function extractSlugFromUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const idIndex = parts.findIndex((p) => /^\d{5,}$/.test(p));
    if (idIndex >= 0 && parts[idIndex + 1]) return parts[idIndex + 1].toLowerCase();
    if (parts.length >= 2 && parts[0] !== 'post' && /^\d{5,}$/.test(parts[1]) && parts[2]) return parts[2].toLowerCase();
  } catch {
    return undefined;
  }
  return undefined;
}

export function deriveMatchInput(viewedUrl: string): PostMatchInput {
  let blogNameHint: string | undefined;
  try {
    const url = new URL(viewedUrl);
    const hostBlog = url.hostname.match(/^([a-z0-9-]+)\.tumblr\.com$/i)?.[1];
    if (hostBlog && hostBlog !== 'www') blogNameHint = hostBlog.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    if (!blogNameHint && parts[0] && parts[0] !== 'post') blogNameHint = parts[0].toLowerCase();
  } catch {
    // ignore
  }
  return {
    viewedUrl,
    postIdHint: extractIdFromUrl(viewedUrl),
    slugHint: extractSlugFromUrl(viewedUrl),
    blogNameHint,
  };
}

export function summarizeCandidate(post: RawPostObject, index: number): CandidatePostSummary {
  return {
    index,
    id: digits(post.id),
    idString: typeof post.idString === 'string' ? post.idString : undefined,
    blogName: typeof post.blogName === 'string' ? post.blogName : undefined,
    postUrl: typeof post.postUrl === 'string' ? post.postUrl : undefined,
    canonicalUrl: typeof post.canonicalUrl === 'string' ? post.canonicalUrl : undefined,
    slug: typeof post.slug === 'string' ? post.slug : undefined,
  };
}

interface Score {
  value: number;
  reasons: string[];
}

function scoreCandidate(input: PostMatchInput, post: RawPostObject): Score {
  const reasons: string[] = [];
  let value = 0;
  const ids = new Set([digits(post.id), typeof post.idString === 'string' ? post.idString : undefined, extractIdFromUrl(post.postUrl), extractIdFromUrl(post.canonicalUrl)].filter(Boolean) as string[]);
  const urls = new Set([normUrl(post.postUrl), normUrl(post.canonicalUrl)].filter(Boolean) as string[]);
  const viewed = normUrl(input.viewedUrl);

  if (input.postIdHint && ids.has(input.postIdHint)) {
    value += 100;
    reasons.push(`id matches viewed URL (${input.postIdHint})`);
  }
  if (viewed && urls.has(viewed)) {
    value += 90;
    reasons.push('post/canonical URL matches viewed URL');
  }
  if (input.postIdHint) {
    for (const url of urls) if (extractIdFromUrl(url) === input.postIdHint) { value += 70; reasons.push('candidate URL contains viewed post id'); break; }
  }
  if (input.blogNameHint && typeof post.blogName === 'string' && post.blogName.toLowerCase() === input.blogNameHint) {
    value += 10;
    reasons.push(`blogName matches (${post.blogName})`);
  }
  if (input.slugHint && typeof post.slug === 'string' && post.slug.toLowerCase() === input.slugHint) {
    value += 15;
    reasons.push(`slug matches (${post.slug})`);
  }
  if (ids.has(digits(input.viewedUrl) ?? 'never')) {
    value += 60;
    reasons.push('id appears in viewed URL');
  }
  return { value, reasons };
}

export function matchViewedPost(posts: RawPostObject[], input: PostMatchInput): PostMatchResult | { error: string; candidates: CandidatePostSummary[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const candidates = posts.map((p, i) => summarizeCandidate(p, i));
  if (posts.length === 0) return { error: 'No post objects found in candidate data.', candidates, diagnostics };
  if (posts.length === 1) {
    return { matched: posts[0], confidence: 'high', reason: 'Only one post object candidate found.', candidates, diagnostics };
  }

  const scored = posts.map((post, index) => ({ post, index, score: scoreCandidate(input, post) }));
  scored.sort((a, b) => b.score.value - a.score.value || a.index - b.index);
  const best = scored[0];
  const second = scored[1];
  diagnostics.push(`Scored ${posts.length} post candidates from viewed URL ${input.viewedUrl}.`);

  if (best.score.value >= 100) {
    return { matched: best.post, confidence: 'high', reason: best.score.reasons.join('; ') || 'Strong id/URL match.', candidates, diagnostics };
  }
  if (best.score.value >= 70 && best.score.value > second.score.value) {
    return { matched: best.post, confidence: 'medium', reason: best.score.reasons.join('; ') || 'Probable URL/id match.', candidates, diagnostics };
  }
  if (best.score.value > 0 && best.score.value >= second.score.value + 25) {
    return { matched: best.post, confidence: 'medium', reason: best.score.reasons.join('; ') || 'Best heuristic match among candidates.', candidates, diagnostics };
  }
  return {
    error: 'Ambiguous Tumblr post candidates; could not confidently identify the viewed post.',
    candidates,
    diagnostics: [...diagnostics, `Best score ${best.score.value}, second ${second.score.value}. Provide/open a direct post URL or inspect candidate diagnostics.`],
  };
}
