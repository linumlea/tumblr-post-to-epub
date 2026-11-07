import { bestMedia, ignoredEmbedHtml, parseMedia, parseMediaArray, rawAttribution } from './media-parser';
import { normalizeFormatting } from './text-parser';
import { parseLayouts } from './layout-parser';
import type {
  AudioBlock,
  ImageBlock,
  JsonObject,
  LinkBlock,
  NormalizedBlock,
  NormalizedPost,
  NormalizedTrailEntry,
  PollBlock,
  PaywallBlock,
  RawBlock,
  TextBlock,
  UnknownBlock,
  UnknownObservation,
  VideoBlock,
} from './types';
import type { SanitizedPost, SanitizedTrailEntry } from './extract-types';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export interface ParseContext {
  unknowns: UnknownObservation[];
  diagnostics: string[];
}

function context(): ParseContext {
  return { unknowns: [], diagnostics: [] };
}

function unknownBlock(raw: RawBlock, path: string, unknowns: UnknownObservation[], note?: string): UnknownBlock {
  const originalType = str(raw.type) ?? 'missing';
  unknowns.push({ path, type: `block:${originalType}`, keys: Object.keys(raw) });
  const textFallback = [note ? `Unsupported block: ${originalType} (${note})` : `Unsupported block: ${originalType}`,
    str(raw.text), str(raw.title), str(raw.url)].filter(Boolean).join(' — ') || undefined;
  return { kind: 'unknown', originalType, textFallback, raw };
}

export function parseTextBlock(raw: RawBlock): TextBlock {
  const text = str(raw.text) ?? (typeof raw.text === 'string' ? raw.text : '');
  const formatting = normalizeFormatting(raw.formatting, text.length);
  return { kind: 'text', text, subtype: str(raw.subtype), formatting, raw };
}

export function parseImageBlock(raw: RawBlock): ImageBlock {
  const media = parseMediaArray(raw.media);
  return {
    kind: 'image',
    media,
    altText: str(raw.alt_text) ?? str(raw.altText),
    caption: str(raw.caption),
    attribution: rawAttribution(raw),
    feedbackToken: str(raw.feedback_token) ?? str(raw.feedbackToken),
    colors: raw.colors && typeof raw.colors === 'object' && !Array.isArray(raw.colors) ? (raw.colors as Record<string, string>) : undefined,
    raw,
  };
}

export function parseLinkBlock(raw: RawBlock): LinkBlock {
  return {
    kind: 'link',
    url: str(raw.url) ?? '',
    title: str(raw.title),
    description: str(raw.description),
    author: str(raw.author),
    siteName: str(raw.site_name) ?? str(raw.siteName),
    displayUrl: str(raw.display_url) ?? str(raw.displayUrl),
    poster: parseMediaArray(raw.poster),
    raw,
  };
}

export function parseAudioBlock(raw: RawBlock, path: string, unknowns: UnknownObservation[]): AudioBlock {
  if (ignoredEmbedHtml(raw)) unknowns.push({ path, type: 'ignored:embed-html', keys: ['embedHtml/embed_html/embed_iframe'] });
  return {
    kind: 'audio',
    provider: str(raw.provider),
    url: raw.url === null ? null : str(raw.url),
    title: str(raw.title),
    artist: str(raw.artist),
    album: str(raw.album),
    media: parseMedia(raw.media),
    poster: parseMediaArray(raw.poster),
    embedHtmlIgnored: ignoredEmbedHtml(raw),
    attribution: rawAttribution(raw),
    raw,
  };
}

export function parseVideoBlock(raw: RawBlock, path: string, unknowns: UnknownObservation[]): VideoBlock {
  if (ignoredEmbedHtml(raw)) unknowns.push({ path, type: 'ignored:embed-html', keys: ['embedHtml/embed_html/embed_iframe'] });
  return {
    kind: 'video',
    provider: str(raw.provider),
    url: raw.url === null ? null : str(raw.url),
    media: parseMedia(raw.media),
    poster: parseMediaArray(raw.poster),
    filmstrip: parseMedia(raw.filmstrip),
    embedHtmlIgnored: ignoredEmbedHtml(raw),
    canAutoplayOnCellular: typeof raw.can_autoplay_on_cellular === 'boolean' ? raw.can_autoplay_on_cellular : undefined,
    attribution: rawAttribution(raw),
    raw,
  };
}

export function parsePollBlock(raw: RawBlock): PollBlock {
  const answersRaw = Array.isArray(raw.answers) ? raw.answers : [];
  return {
    kind: 'poll',
    clientId: str(raw.client_id) ?? str(raw.clientId),
    question: str(raw.question) ?? '',
    answers: answersRaw.map((a) => {
      const item = a && typeof a === 'object' ? (a as JsonObject) : {};
      return { clientId: str(item.client_id) ?? str(item.clientId), answerText: str(item.answer_text) ?? str(item.answerText) ?? '' };
    }),
    settings: raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings) ? (raw.settings as JsonObject) : undefined,
    createdAt: str(raw.created_at) ?? str(raw.createdAt),
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : undefined,
    source: str(raw.source),
    raw,
  };
}

export function parsePaywallBlock(raw: RawBlock): PaywallBlock {
  return {
    kind: 'paywall',
    subtype: str(raw.subtype),
    title: str(raw.title),
    text: str(raw.text),
    raw,
  };
}

export function parseContentBlock(raw: unknown, path: string, unknowns: UnknownObservation[]): NormalizedBlock {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return unknownBlock({ type: 'invalid' } as RawBlock, path, unknowns, 'not an object');
  const block = raw as RawBlock;
  const type = str(block.type) ?? '';
  switch (type) {
    case 'text': return parseTextBlock(block);
    case 'image': return parseImageBlock(block);
    case 'link': return parseLinkBlock(block);
    case 'audio': return parseAudioBlock(block, path, unknowns);
    case 'video': return parseVideoBlock(block, path, unknowns);
    case 'poll': return parsePollBlock(block);
    case 'paywall': return parsePaywallBlock(block);
    default: return unknownBlock(block, path, unknowns);
  }
}

export function parseContentBlocks(raw: unknown, basePath: string, unknowns: UnknownObservation[]): NormalizedBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => parseContentBlock(item, `${basePath}[${i}]`, unknowns));
}

function parseTags(post: SanitizedPost): string[] {
  if (Array.isArray(post.tags) && post.tags.length) return post.tags.filter((t): t is string => typeof t === 'string');
  if (Array.isArray(post.tagsV2)) {
    return post.tagsV2.map((t) => {
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object' && typeof (t as any).name === 'string') return (t as any).name;
      return undefined;
    }).filter((t): t is string => !!t);
  }
  return [];
}

export function parseTrailEntry(raw: SanitizedTrailEntry, index: number, ctx: ParseContext): NormalizedTrailEntry {
  const base = `trail[${index}]`;
  const blog = raw.blog && typeof raw.blog === 'object' ? (raw.blog as Record<string, unknown>) : undefined;
  const post = raw.post && typeof raw.post === 'object' ? (raw.post as Record<string, unknown>) : undefined;
  return {
    blogName: str(blog?.name),
    blogTitle: str(blog?.title),
    blogUrl: str(blog?.url),
    blogUuid: str(blog?.uuid),
    postId: raw.post?.id != null ? String((post?.id as any) ?? raw.post.id) : undefined,
    timestamp: num(post?.timestamp),
    brokenBlogName: str(raw.brokenBlogName),
    content: parseContentBlocks(raw.content, `${base}.content`, ctx.unknowns),
    layout: parseLayouts(raw.layout, `${base}.layout`, ctx.unknowns),
    unknowns: [],
  };
}

export function parseSanitizedPost(post: SanitizedPost): { post: NormalizedPost; diagnostics: string[] } {
  const ctx = context();
  const id = post.idString ?? (post.id != null ? String(post.id) : '');
  if (!id) ctx.diagnostics.push('Post has no id/idString.');
  const content = parseContentBlocks(post.content, 'content', ctx.unknowns);
  const trail = Array.isArray(post.trail) ? post.trail.map((t, i) => parseTrailEntry(t, i, ctx)) : [];
  const hasRoot = content.length > 0;
  const hasTrail = trail.some((t) => t.content.length > 0);
  if (!hasRoot && !hasTrail) ctx.diagnostics.push('Normalized post has no root or trail content blocks.');
  if (hasRoot && hasTrail) ctx.diagnostics.push('Post contains both root content and trail content; preserve both in order during rendering.');
  if (ctx.unknowns.length) ctx.diagnostics.push(`Observed ${ctx.unknowns.length} unknown/ignored element(s).`);

  const normalized: NormalizedPost = {
    id,
    idString: post.idString,
    blogName: post.blogName,
    blogTitle: str((post.blog as any)?.title),
    url: post.postUrl,
    canonicalUrl: post.canonicalUrl,
    slug: post.slug,
    timestamp: post.timestamp,
    date: post.date,
    title: undefined,
    summary: post.summary,
    tags: parseTags(post),
    sourceUrl: post.sourceUrl,
    sourceTitle: post.sourceTitle,
    askingName: post.askingName,
    askingUrl: post.askingUrl,
    content,
    trail,
    layout: parseLayouts(post.layout, 'layout', ctx.unknowns),
    communityLabels: post.communityLabels,
    isNsfw: post.isNsfw,
    classification: post.classification,
    unknowns: ctx.unknowns,
  };
  return { post: normalized, diagnostics: ctx.diagnostics };
}

export { bestMedia };

