import type { ExtractionResult, SanitizedPost } from '../tumblr/extract-types';
import { parseSanitizedPost } from '../tumblr/parser';

function clean(text: string | null | undefined): string | undefined {
  const v = text?.replace(/\s+/g, ' ').trim();
  return v || undefined;
}

export function extractDomFallback(viewedUrl: string, doc: Document): ExtractionResult {
  const diagnostics: string[] = [
    'Embedded JSON extraction failed or was ambiguous; using limited DOM fallback.',
    'DOM fallback cannot guarantee full NPF fidelity (formatting/layout/trail details may be incomplete).',
  ];
  const article = doc.querySelector('article') ?? doc.querySelector('[data-id]') ?? doc.querySelector('main');
  const title = clean(doc.querySelector('h1')?.textContent) ?? clean(doc.title);
  const paragraphs = Array.from((article ?? doc.body).querySelectorAll('p, blockquote, li, h1, h2, h3'))
    .map((el) => clean(el.textContent))
    .filter((t): t is string => !!t && t.length > 1)
    .slice(0, 500)
    .map((text) => ({ type: 'text', text }));
  const images = Array.from((article ?? doc.body).querySelectorAll('img'))
    .map((img) => ({ type: 'image', media: [{ url: img.currentSrc || img.src, altText: clean(img.alt) }] }))
    .filter((b) => typeof b.media[0].url === 'string' && b.media[0].url.length > 0)
    .slice(0, 200);

  const post: SanitizedPost = {
    objectType: 'post',
    postUrl: viewedUrl,
    canonicalUrl: viewedUrl,
    summary: title,
    content: [...paragraphs, ...images] as unknown as SanitizedPost['content'],
    layout: [],
    trail: [],
  };
  if (!paragraphs.length && !images.length) diagnostics.push('DOM fallback found little or no readable post content.');
  const parsed = parseSanitizedPost(post);
  diagnostics.push(...parsed.diagnostics);

  return {
    ok: true,
    source: 'dom-fallback',
    viewedUrl,
    post,
    normalizedPost: parsed.post,
    bodyLocation: paragraphs.length || images.length ? 'root' : 'none',
    candidatesCount: 0,
    diagnostics,
  };
}
