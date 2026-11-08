import { bestMedia } from '../tumblr/media-parser';
import { segmentFormattedText } from '../tumblr/text-parser';
import type {
  AudioBlock,
  ImageBlock,
  LinkBlock,
  MediaCandidate,
  NormalizedBlock,
  NormalizedFormatting,
  NormalizedLayout,
  NormalizedPost,
  NormalizedTrailEntry,
  PaywallBlock,
  PollBlock,
  TextBlock,
  UnknownBlock,
  VideoBlock,
} from '../tumblr/types';
import { EPUB_CSS } from './styles';

export interface RenderOptions {
  includeTrail?: boolean;
  includeTags?: boolean;
  cssHref?: string;
  embedMedia?: boolean;
  /** Maps original remote media URL to a local EPUB-relative path (e.g. assets/image-001.gif). */
  resolveMediaUrl?: (originalUrl: string) => string | undefined;
}

export interface RenderDocumentResult {
  xhtml: string;
  title: string;
  filenameBase: string;
  diagnostics: string[];
}

const DEFAULT_OPTIONS = {
  includeTrail: true,
  includeTags: true,
  cssHref: '../styles/style.css',
  embedMedia: false,
  resolveMediaUrl: undefined as ((originalUrl: string) => string | undefined) | undefined,
};

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  // Allow relative local asset paths used by placeholder/media pipeline.
  if (/^(?:\.\.?\/|assets\/)/.test(trimmed)) return trimmed;
  return undefined;
}

function safeColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const m = hex.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  return m ? `#${m[1]}` : undefined;
}

function formatTimestamp(ts: number | undefined, date: string | undefined): string | undefined {
  if (date) return date;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return undefined;
  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function slugify(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'post';
}

export function postTitle(post: NormalizedPost): string {
  return (
    post.title?.trim() ||
    post.summary?.trim() ||
    (post.blogName ? `Post by ${post.blogName}` : 'Tumblr post')
  );
}

export function filenameBase(post: NormalizedPost): string {
  const blog = slugify(post.blogName || 'tumblr');
  const id = (post.id || post.idString || 'post').replace(/[^a-zA-Z0-9_-]+/g, '');
  return `tumblr-${blog}-${id || 'post'}`;
}

function renderFormatting(text: string, formatting: NormalizedFormatting[]): string {
  if (!text) return '';
  const segments = segmentFormattedText(text, formatting);
  let out = '';
  for (const seg of segments) {
    let inner = esc(seg.text);
    for (const fmt of seg.formatting) {
      switch (fmt.type) {
        case 'bold':
          inner = `<strong>${inner}</strong>`;
          break;
        case 'italic':
          inner = `<em>${inner}</em>`;
          break;
        case 'strikethrough':
          inner = `<s>${inner}</s>`;
          break;
        case 'small':
          inner = `<small>${inner}</small>`;
          break;
        case 'color': {
          const color = safeColor(fmt.hex);
          inner = color ? `<span style="color: ${color}">${inner}</span>` : inner;
          break;
        }
        case 'link': {
          const href = safeUrl(fmt.url);
          inner = href ? `<a href="${esc(href)}">${inner}</a>` : inner;
          break;
        }
        case 'mention': {
          // Never inject Tumblr-provided HTML; render as safe link/text only.
          const href = safeUrl(fmt.url) || (fmt.blogName ? safeUrl(`https://www.tumblr.com/${encodeURIComponent(fmt.blogName)}`) : undefined);
          inner = href ? `<a href="${esc(href)}" class="mention">${inner}</a>` : `<span class="mention">${inner}</span>`;
          break;
        }
        default:
          inner = `<span class="format-${esc(fmt.type)}">${inner}</span>`;
      }
    }
    out += inner;
  }
  return out;
}

type ListType = 'ordered' | 'unordered';
type RenderState = { list: { type: ListType; items: string[] } | null };

function flushList(state: RenderState): string {
  if (!state.list || !state.list.items.length) {
    state.list = null;
    return '';
  }
  const tag = state.list.type === 'ordered' ? 'ol' : 'ul';
  const html = `<${tag}>${state.list.items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`;
  state.list = null;
  return html;
}

function pushListItem(state: RenderState, type: ListType, item: string): string {
  if (state.list && state.list.type !== type) {
    const flushed = flushList(state);
    state.list = { type, items: [item] };
    return flushed;
  }
  if (!state.list) state.list = { type, items: [item] };
  else state.list.items.push(item);
  return '';
}

function renderTextBlock(block: TextBlock, state: RenderState): string {
  const content = renderFormatting(block.text, block.formatting);
  const subtype = block.subtype;
  if (subtype === 'ordered-list-item') return pushListItem(state, 'ordered', content);
  if (subtype === 'unordered-list-item') return pushListItem(state, 'unordered', content);
  let out = flushList(state);
  switch (subtype) {
    case 'heading1':
      out += `<h1>${content}</h1>`;
      break;
    case 'heading2':
      out += `<h2>${content}</h2>`;
      break;
    case 'quote':
      out += `<blockquote><p>${content || '&#160;'}</p></blockquote>`;
      break;
    case 'indented':
      out += `<blockquote class="indented"><p>${content || '&#160;'}</p></blockquote>`;
      break;
    case 'chat':
      out += `<div class="chat-block"><p class="chat-line">${content || '&#160;'}</p></div>`;
      break;
    case 'quirky':
      out += `<p class="quirky">${content || '&#160;'}</p>`;
      break;
    default:
      out += `<p>${content || '&#160;'}</p>`;
  }
  return out;
}

function mediaPlaceholderUrl(scope: string, blockIndex: number, candidateIndex: number, media?: MediaCandidate, resolve?: (url: string) => string | undefined): string {
  if (media?.url && resolve) {
    const resolved = resolve(media.url);
    if (resolved) return resolved;
  }
  const extFromDeclared = media?.declaredType?.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
  return `assets/${scope}-block-${blockIndex + 1}-${candidateIndex + 1}.${extFromDeclared || 'bin'}`;
}

function renderImageFigure(image: ImageBlock, src: string, captionExtra?: string): string {
  const alt = esc(image.altText ?? '');
  const caption = [image.caption, captionExtra].filter(Boolean).map((t) => esc(String(t))).join(' ');
  // Preserve alt text visibly (in addition to the img alt attribute) when post data provides it.
  // Avoid duplicating text that is already shown as the caption.
  const captionText = [image.caption, captionExtra].filter(Boolean).map((t) => String(t).trim()).join(' ');
  const altText = image.altText && image.altText.trim() && image.altText.trim() !== captionText ? `<p class="image-alt">${esc(image.altText)}</p>` : '';
  return `<figure class="image"><img src="${esc(src)}" alt="${alt}"/>${caption ? `<figcaption>${caption}</figcaption>` : ''}${altText}</figure>`;
}

function renderImageBlock(block: ImageBlock, scope: string, blockIndex: number, resolve?: (url: string) => string | undefined): string {
  const selected = bestMedia(block.media);
  if (!selected) {
    return `<div class="media-fallback"><p><strong>Image unavailable.</strong></p>${block.altText ? `<p>${esc(block.altText)}</p>` : ''}${block.caption ? `<p>${esc(block.caption)}</p>` : ''}</div>`;
  }
  return renderImageFigure(block, mediaPlaceholderUrl(scope, blockIndex, block.media.indexOf(selected), selected, resolve));
}

function renderLinkBlock(block: LinkBlock): string {
  const href = safeUrl(block.url);
  const label = esc(block.title || block.displayUrl || block.url || 'External link');
  const parts: string[] = [`<div class="link-card">`];
  parts.push(href ? `<p><a href="${esc(href)}">${label}</a></p>` : `<p>${label}</p>`);
  if (block.description) parts.push(`<p>${esc(block.description)}</p>`);
  const meta = [block.author, block.siteName, block.displayUrl].filter(Boolean).map((s) => esc(String(s))).join(' · ');
  if (meta) parts.push(`<p class="post-meta">${meta}</p>`);
  if (href && block.displayUrl && block.displayUrl !== block.title) parts.push(`<p class="link-url"><a href="${esc(href)}">${esc(href)}</a></p>`);
  parts.push(`</div>`);
  return parts.join('');
}

function renderProviderBlock(
  kind: 'audio' | 'video',
  title: string | undefined,
  provider: string | undefined,
  url: string | null | undefined,
  poster: MediaCandidate[] | undefined,
  extra: string[],
  diagnostics: string[],
  scope: string,
  blockIndex: number,
  resolve?: (url: string) => string | undefined,
  embedMedia = false,
): string {
  const href = safeUrl(url ?? undefined);
  const chosenPoster = poster?.length ? bestMedia(poster) : undefined;
  const posterSrc = chosenPoster ? mediaPlaceholderUrl(scope, blockIndex, 0, chosenPoster, resolve) : undefined;
  const mediaUrl = url && embedMedia ? resolve?.(url) : undefined;

  if (embedMedia && mediaUrl && safeUrl(mediaUrl)) {
    const parts = [`<figure class="media-block ${kind}-block">`];
    if (kind === 'audio') {
      parts.push(`<audio controls="controls" preload="metadata" src="${esc(mediaUrl)}"></audio>`);
    } else {
      parts.push(`<video controls="controls" preload="metadata" src="${esc(mediaUrl)}"${posterSrc ? ` poster="${esc(posterSrc)}"` : ''}></video>`);
    }
    const cap: string[] = [];
    cap.push(`<strong>${esc(title || (kind === 'audio' ? 'Audio' : 'Video'))}</strong>`);
    if (provider) cap.push(esc(provider));
    if (href) cap.push(`<a href="${esc(href)}">Original ${kind}</a>`);
    parts.push(`<figcaption>${cap.join(' · ')}${extra.length ? `<div class="post-meta">${extra.map(esc).join(' · ')}</div>` : ''}</figcaption>`);
    parts.push(`</figure>`);
    diagnostics.push(`${kind} block embedded as local EPUB media because the setting is enabled.`);
    return parts.join('');
  }

  const parts = [`<figure class="media-block ${kind}-block">`];
  if (chosenPoster) {
    parts.push(`<img src="${esc(mediaPlaceholderUrl(scope, blockIndex, 0, chosenPoster, resolve))}" alt="${esc(title || kind)} poster"/>`);
  }
  const cap: string[] = [];
  cap.push(`<strong>${esc(title || (kind === 'audio' ? 'Audio' : 'Video'))}</strong>`);
  if (provider) cap.push(esc(provider));
  if (href) cap.push(`<a href="${esc(href)}">Original ${kind}</a>`);
  parts.push(`<figcaption>${cap.join(' · ')}${extra.length ? `<div class="post-meta">${extra.map(esc).join(' · ')}</div>` : ''}</figcaption>`);
  parts.push(`</figure>`);
  diagnostics.push(`${kind} block rendered as metadata/fallback (embed HTML never injected).`);
  return parts.join('');
}

function renderAudioBlock(block: AudioBlock, diagnostics: string[], scope: string, blockIndex: number, resolve?: (url: string) => string | undefined, embedMedia = false): string {
  const extra = [block.artist, block.album].filter(Boolean) as string[];
  const sourceUrl = block.media?.url ?? block.url ?? undefined;
  return renderProviderBlock('audio', block.title, block.provider, sourceUrl, block.poster, extra, diagnostics, scope, blockIndex, resolve, embedMedia);
}

function renderVideoBlock(block: VideoBlock, diagnostics: string[], scope: string, blockIndex: number, resolve?: (url: string) => string | undefined, embedMedia = false): string {
  const sourceUrl = block.media?.url ?? block.url ?? undefined;
  return renderProviderBlock('video', undefined, block.provider, sourceUrl, block.poster?.length ? block.poster : block.filmstrip ? [block.filmstrip] : undefined, [], diagnostics, scope, blockIndex, resolve, embedMedia);
}

function renderPollBlock(block: PollBlock): string {
  const items = block.answers.map((a) => `<li>${esc(a.answerText || '')}</li>`).join('');
  const meta = [block.source, block.createdAt].filter(Boolean).map((s) => esc(String(s))).join(' · ');
  return `<section class="poll-block"><h3>${esc(block.question || 'Poll')}</h3><ul>${items}</ul>${meta ? `<p class="post-meta">${meta}</p>` : ''}<p class="media-fallback">Poll preserved as read-only data; voting is not available in the exported EPUB.</p></section>`;
}

function renderPaywallBlock(block: PaywallBlock): string {
  return `<section class="paywall-block"><h3>${esc(block.title || 'Restricted content')}</h3>${block.text ? `<p>${esc(block.text)}</p>` : ''}<p class="media-fallback">Additional content may be restricted. This export does not bypass access controls.</p></section>`;
}

function renderUnknownBlock(block: UnknownBlock, diagnostics: string[]): string {
  diagnostics.push(`Rendered fallback for unknown block type: ${block.originalType}`);
  return `<div class="block-fallback"><p><strong>Unsupported content block</strong>: ${esc(block.originalType)}</p>${block.textFallback ? `<p>${esc(block.textFallback)}</p>` : ''}</div>`;
}

function renderNonTextBlock(block: NormalizedBlock, diagnostics: string[], scope: string, blockIndex: number, resolve?: (url: string) => string | undefined, embedMedia = false): string {
  switch (block.kind) {
    case 'image':
      return renderImageBlock(block, scope, blockIndex, resolve);
    case 'link':
      return renderLinkBlock(block);
    case 'audio':
      return renderAudioBlock(block, diagnostics, scope, blockIndex, resolve, embedMedia);
    case 'video':
      return renderVideoBlock(block, diagnostics, scope, blockIndex, resolve, embedMedia);
    case 'poll':
      return renderPollBlock(block);
    case 'paywall':
      return renderPaywallBlock(block);
    case 'unknown':
      return renderUnknownBlock(block, diagnostics);
    case 'text':
      return '';
    default:
      return renderUnknownBlock({ kind: 'unknown', originalType: String((block as any)?.kind ?? 'unknown') }, diagnostics);
  }
}

function rowsLayoutIndices(layouts: NormalizedLayout[]): { displays: Array<{ blocks: number[] }>; truncateAfter: number[] } {
  const displays: Array<{ blocks: number[] }> = [];
  const truncateAfter: number[] = [];
  for (const l of layouts) {
    if (l.type !== 'rows') continue;
    displays.push(...l.displays);
    if (typeof l.truncateAfter === 'number') truncateAfter.push(l.truncateAfter);
  }
  return { displays, truncateAfter };
}

function condensedLayouts(layouts: NormalizedLayout[]): Array<{ blocks: number[]; truncateAfter?: number }> {
  return layouts.filter((l): l is Extract<NormalizedLayout, { type: 'condensed' }> => l.type === 'condensed');
}

function askLayout(layouts: NormalizedLayout[]): Extract<NormalizedLayout, { type: 'ask' }> | undefined {
  return layouts.find((l): l is Extract<NormalizedLayout, { type: 'ask' }> => l.type === 'ask');
}

export function renderContentBlocks(blocks: NormalizedBlock[], layouts: NormalizedLayout[], diagnostics: string[], scope: string, resolve?: (url: string) => string | undefined, embedMedia = false): string {
  const state: RenderState = { list: null };
  const rows = rowsLayoutIndices(layouts);
  const condensed = condensedLayouts(layouts);
  const ask = askLayout(layouts);
  const rendered = new Set<number>();
  let out = '';

  const truncateCandidates = [
    ...rows.truncateAfter.filter((n) => n >= 0),
    ...condensed.map((c) => c.truncateAfter).filter((n): n is number => typeof n === 'number' && n >= 0),
  ];
  let readMoreAt: number | undefined = truncateCandidates.length ? Math.min(...truncateCandidates) : undefined;

  const renderIndex = (i: number): string => {
    if (i < 0 || i >= blocks.length || rendered.has(i)) return '';
    let html = '';
    if (readMoreAt !== undefined && i === readMoreAt) {
      html += flushList(state) + `<p class="read-more">[Read More boundary — layout indicates content may be collapsed on Tumblr; preserved order follows available data]</p>`;
      readMoreAt = undefined;
    }
    rendered.add(i);
    const block = blocks[i];
    if (block.kind === 'text') html += renderTextBlock(block, state);
    else html += flushList(state) + renderNonTextBlock(block, diagnostics, scope, i, resolve, embedMedia);
    return html;
  };

  if (ask && ask.blocks.length) {
    const askState: RenderState = { list: null };
    let askHtml = `<section class="ask-block"><h3 class="sr-only">Ask</h3>`;
    for (const idx of ask.blocks) {
      if (idx < 0 || idx >= blocks.length || rendered.has(idx)) continue;
      rendered.add(idx);
      const block = blocks[idx];
      if (block.kind === 'text') askHtml += renderTextBlock(block, askState);
      else askHtml += flushList(askState) + renderNonTextBlock(block, diagnostics, scope, idx, resolve, embedMedia);
    }
    askHtml += flushList(askState) + `</section>`;
    out += askHtml;
  }

  for (const display of rows.displays) {
    const indices = display.blocks.filter((i) => i >= 0 && i < blocks.length && !rendered.has(i));
    if (!indices.length) continue;
    const imagesOnly = indices.every((i) => blocks[i]?.kind === 'image');
    if (imagesOnly && indices.length > 1) {
      out += flushList(state) + `<div class="gallery-row" role="group" aria-label="Image gallery">`;
      for (const i of indices) {
        if (readMoreAt !== undefined && i === readMoreAt) {
          out += `<p class="read-more">[Read More boundary — layout indicates content may be collapsed on Tumblr; preserved order follows available data]</p>`;
          readMoreAt = undefined;
        }
        rendered.add(i);
        out += renderImageBlock(blocks[i] as ImageBlock, scope, i, resolve);
      }
      out += `</div>`;
    } else {
      for (const i of indices) out += renderIndex(i);
    }
  }

  for (let i = 0; i < blocks.length; i++) out += renderIndex(i);
  if (readMoreAt !== undefined && readMoreAt >= blocks.length) {
    out += flushList(state) + `<p class="read-more">[Read More boundary indicated by layout metadata]</p>`;
  }
  out += flushList(state);

  if (condensed.length && !rows.truncateAfter.length) {
    diagnostics.push('Condensed layout observed; rendered available content in order with read-more/boundary fallback when indicated.');
  }
  return out;
}

function renderTrailAttribution(trail: NormalizedTrailEntry): string {
  const who = [trail.blogName, trail.blogTitle].filter(Boolean).join(' — ');
  const when = formatTimestamp(trail.timestamp, undefined);
  const blogName = trail.blogName || trail.brokenBlogName || 'Unknown blog';
  const blogHref = trail.brokenBlogName
    ? undefined
    : trail.blogUrl
      ? safeUrl(trail.blogUrl)
      : trail.blogName
        ? safeUrl(`https://www.tumblr.com/${encodeURIComponent(trail.blogName)}`)
        : undefined;
  const nameHtml = blogHref ? `<a href="${esc(blogHref)}">${esc(trail.brokenBlogName ? trail.brokenBlogName : (who || blogName))}</a>` : esc(trail.brokenBlogName ? trail.brokenBlogName : (who || blogName));
  const postId = trail.postId;
  const postHref = trail.blogName && postId
    ? safeUrl(`https://www.tumblr.com/${encodeURIComponent(trail.blogName)}/${postId}`)
    : undefined;
  const idHtml = postId ? (postHref ? `<a href="${esc(postHref)}">#${esc(postId)}</a>` : `#${esc(postId)}`) : '';
  const meta: string[] = [];
  if (when) meta.push(esc(when));
  if (idHtml) meta.push(idHtml);
  return `<div class="trail-attribution">${nameHtml}${meta.length ? ` <span class="post-meta">(${meta.join(' · ')})</span>` : ''}</div>`;
}

function renderSourceMeta(sourceUrl?: string | null, sourceTitle?: string, asParagraph = false): string {
  const href = safeUrl(sourceUrl ?? undefined);
  const title = sourceTitle?.trim();
  if (!href && !title) return '';
  const label = esc(title || 'Original source');
  const link = href ? `<a href="${esc(href)}">${label}</a>` : label;
  return asParagraph
    ? `<p class="post-meta">Original source: ${link}</p>`
    : `<div class="post-meta">Original source: ${link}</div>`;
}

function renderTrailSourceMeta(trail: NormalizedTrailEntry): string {
  return renderSourceMeta(trail.sourceUrl, trail.sourceTitle);
}

function renderTrail(trail: NormalizedTrailEntry[], diagnostics: string[], scopePrefix: string, resolve?: (url: string) => string | undefined, embedMedia = false): string {
  return trail
    .filter((t) => t.content.length > 0 || t.layout.length > 0)
    .map((t, i) => {
      const inner = renderContentBlocks(t.content, t.layout, diagnostics, `${scopePrefix}-trail-${i + 1}`, resolve, embedMedia);
      const sourceMeta = renderTrailSourceMeta(t);
      return `<section class="trail-entry">${renderTrailAttribution(t)}${sourceMeta ? `${sourceMeta}` : ''}<div class="post-content">${inner}</div></section>`;
    })
    .join('');
}

export function renderPostBodyXhtml(post: NormalizedPost, options: RenderOptions = {}): { body: string; diagnostics: string[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const resolve = opts.resolveMediaUrl;
  const embedMedia = !!opts.embedMedia;
  const diagnostics: string[] = [];
  let body = `<main><article class="tumblr-post">`;

  const meta: string[] = [];
  if (post.blogName) {
    const blogHref = post.blogUrl ? safeUrl(post.blogUrl) : safeUrl(`https://www.tumblr.com/${encodeURIComponent(post.blogName)}`);
    meta.push(blogHref ? `<a href="${esc(blogHref)}">${esc(post.blogName)}</a>` : esc(post.blogName));
  }
  const when = formatTimestamp(post.timestamp, post.date);
  if (when) meta.push(esc(when));
  const url = safeUrl(post.url || post.canonicalUrl);
  let headerMeta = '';
  if (meta.length) headerMeta += `<p class="post-meta">${meta.join(' · ')}${url ? ` · <a href="${esc(url)}">Source</a>` : ''}</p>`;
  else if (url) headerMeta += `<p class="post-meta"><a href="${esc(url)}">Source</a></p>`;
  const originUrl = safeUrl(post.sourceUrl);
  if (originUrl || post.sourceTitle) {
    headerMeta += renderSourceMeta(post.sourceUrl, post.sourceTitle, true);
  }

  const hasRoot = post.content.length > 0;
  const hasTrail = opts.includeTrail && post.trail.some((t) => t.content.length || t.layout.length);
  const tagsHtml = opts.includeTags && post.tags.length ? `<p class="post-tags">Tags: ${post.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(' ')}</p>` : '';
  if (hasTrail) headerMeta += tagsHtml;

  // For trail/reblog posts, place extracted-post metadata at the end so chronology reads naturally.
  // For regular posts, keep header metadata at top but place tags at the end.
  body += `<header class="post-header"><h1 class="post-title">${esc(postTitle(post))}</h1>${hasTrail ? '' : headerMeta}</header>`;

  if (hasRoot && !hasTrail) {
    body += `<section class="post-content post-root-content">${renderContentBlocks(post.content, post.layout, diagnostics, 'root', resolve, embedMedia)}</section>`;
    if (tagsHtml) body += `<footer class="post-footer post-header">${tagsHtml}</footer>`;
  }
  if (hasTrail) {
    body += renderTrail(post.trail, diagnostics, 'trail', resolve, embedMedia);
  }
  if (hasRoot && hasTrail) {
    const authorText = [post.blogName, post.blogTitle].filter(Boolean).join(' — ') || post.blogName || 'Addition';
    const authorHref = post.blogName
      ? post.blogUrl
        ? safeUrl(post.blogUrl)
        : safeUrl(`https://www.tumblr.com/${encodeURIComponent(post.blogName)}`)
      : undefined;
    const author = authorHref ? `<a href="${esc(authorHref)}">${esc(authorText)}</a>` : esc(authorText);
    const addedWhen = formatTimestamp(post.timestamp, post.date);
    const idHtml = post.id ? (url ? `<a href="${esc(url)}">#${esc(post.id)}</a>` : `#${esc(post.id)}`) : '';
    const additionMeta = [addedWhen ? esc(addedWhen) : '', idHtml].filter(Boolean).join(' · ');
    const originalSourceMeta = originUrl || post.sourceTitle ? `<div class="post-meta">Original source: ${originUrl ? `<a href="${esc(originUrl)}">${esc(post.sourceTitle || 'Original source')}</a>` : esc(post.sourceTitle || 'Original source')}</div>` : '';
    body += `<section class="trail-entry post-addition"><div class="trail-attribution">${author}${additionMeta ? ` <span class="post-meta">(${additionMeta})</span>` : ''}</div>${originalSourceMeta ? `${originalSourceMeta}` : ''}<div class="post-content">${renderContentBlocks(post.content, post.layout, diagnostics, 'root', resolve, embedMedia)}${headerMeta ? `<div class="post-footer-meta">${headerMeta}</div>` : ''}</div></section>`;
    diagnostics.push('Root content rendered after trail as the exporting blog\'s addition (reblog chronology).');
  } else if (hasTrail && (headerMeta || originUrl || post.sourceTitle)) {
    const authorText = [post.blogName, post.blogTitle].filter(Boolean).join(' — ') || post.blogName || 'Addition';
    const authorHref = post.blogName
      ? post.blogUrl
        ? safeUrl(post.blogUrl)
        : safeUrl(`https://www.tumblr.com/${encodeURIComponent(post.blogName)}`)
      : undefined;
    const author = authorHref ? `<a href="${esc(authorHref)}">${esc(authorText)}</a>` : esc(authorText);
    const addedWhen = formatTimestamp(post.timestamp, post.date);
    const idHtml = post.id ? (url ? `<a href="${esc(url)}">#${esc(post.id)}</a>` : `#${esc(post.id)}`) : '';
    const additionMeta = [addedWhen ? esc(addedWhen) : '', idHtml].filter(Boolean).join(' · ');
    const originalSourceMeta = originUrl || post.sourceTitle ? `<div class="post-meta">Original source: ${originUrl ? `<a href="${esc(originUrl)}">${esc(post.sourceTitle || 'Original source')}</a>` : esc(post.sourceTitle || 'Original source')}</div>` : '';
    const footerMeta = headerMeta && !originUrl && !post.sourceTitle ? `<div class="post-footer-meta">${headerMeta}</div>` : '';
    const sourceBlock = originalSourceMeta ? `${originalSourceMeta}${footerMeta}` : footerMeta;
    body += `<section class="trail-entry post-addition"><div class="trail-attribution">${author}${additionMeta ? ` <span class="post-meta">(${additionMeta})</span>` : ''}</div>${sourceBlock || ''}</section>`;
    diagnostics.push('Root metadata rendered in the original-post section when the reblog chain has no root content blocks.');
  } else if (hasTrail && headerMeta) {
    body += `<footer class="post-footer post-header">${headerMeta}</footer>`;
  }
  if (!hasRoot && !hasTrail) {
    body += `<div class="block-fallback"><p>No renderable post content was found.</p></div>`;
    diagnostics.push('Rendered post has no content blocks.');
  }
  if (post.unknowns.length) {
    diagnostics.push(`Post contains ${post.unknowns.length} unknown/ignored observation(s); preserved as diagnostics/fallbacks where possible.`);
  }

  body += `</article></main>`;
  return { body, diagnostics };
}

export function renderPostDocument(post: NormalizedPost, options: RenderOptions = {}): RenderDocumentResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { body, diagnostics } = renderPostBodyXhtml(post, opts);
  const title = postTitle(post);
  const lang = 'en';
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">\n<head>\n  <meta charset="utf-8"/>\n  <title>${esc(title)}</title>\n  <link rel="stylesheet" type="text/css" href="${esc(opts.cssHref)}"/>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  return { xhtml, title, filenameBase: filenameBase(post), diagnostics };
}

export { EPUB_CSS };
