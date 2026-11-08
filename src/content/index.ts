import { MessageType, type ExtensionMessage, type ExtractionResultPayload, type ExportPreparedPayload, type PostStatusPayload } from '../shared/messages';
import { discoverEmbeddedPostGroups } from './embedded-json-extractor';
import { extractDomFallback } from './dom-fallback-extractor';
import { deriveMatchInput, detectBodyLocation, matchViewedPost, sanitizePost, summarizeExtraction } from '../tumblr/extract';
import { parseSanitizedPost } from '../tumblr/parser';
import { collectMediaPlan } from '../media/plan';
import type { ExtractionResult } from '../tumblr/extract-types';

let lastExtraction: ExtractionResult | undefined;

function detectTumblrPost(): PostStatusPayload {
  const host = location.hostname;
  if (!host.endsWith('tumblr.com')) {
    return { status: 'not-tumblr', message: 'This page is not on tumblr.com.' };
  }
  const isLikelyPermalink = /\/post\/\d+/.test(location.pathname) || /tumblr\.com\/[^\s/]+\/\d+/.test(location.href) || /\/blog\/view\//.test(location.pathname);
  if (isLikelyPermalink) {
    return {
      status: 'ready',
      message: 'Tumblr post context detected. Export will download referenced media and package EPUB.',
      canonicalUrl: location.href,
    };
  }
  return {
    status: 'searching',
    message: 'On Tumblr, but no single post permalink detected. Open a post to export it.'
  };
}

function extractCurrentPost(): ExtractionResultPayload {
  const viewedUrl = location.href;
  const discovery = discoverEmbeddedPostGroups(document);
  const matchInput = deriveMatchInput(viewedUrl);
  const posts = discovery.groups.flatMap((g) => g.posts);
  let result: ExtractionResult;
  if (posts.length) {
    const diagnostics = [
      ...discovery.diagnostics,
      `Discovered ${posts.length} post object(s) in ${discovery.groups.length} location(s).`,
      ...discovery.groups.map((g) => `Candidate group ${g.path} (script ${g.scriptIndex}) has ${g.posts.length} post(s).`),
    ];
    const match = matchViewedPost(posts, matchInput);
    if ('error' in match) {
      result = { ok: false, source: 'embedded-json', viewedUrl, candidatesCount: posts.length, diagnostics: [...diagnostics, ...match.diagnostics], error: match.error };
    } else {
      const post = sanitizePost(match.matched);
      const parsed = parseSanitizedPost(post);
      result = {
        ok: true,
        source: 'embedded-json',
        viewedUrl,
        post,
        normalizedPost: parsed.post,
        bodyLocation: detectBodyLocation(post),
        candidatesCount: posts.length,
        diagnostics: [...diagnostics, ...match.diagnostics, `Matched post via: ${match.reason}`, ...parsed.diagnostics],
      };
    }
  } else {
    result = { ok: false, source: 'embedded-json', viewedUrl, candidatesCount: 0, diagnostics: discovery.diagnostics, error: 'No embedded post candidates discovered.' };
  }
  if (!result.ok) {
    const fallback = extractDomFallback(viewedUrl, document);
    fallback.diagnostics = [...result.diagnostics, ...(result.error ? [result.error] : []), ...fallback.diagnostics];
    result = fallback;
  }
  lastExtraction = result;
  return summarizeExtraction(result);
}

function prepareExport(): ExportPreparedPayload {
  const payload = extractCurrentPost();
  if (!payload.ok || !lastExtraction?.normalizedPost) {
    return {
      ok: false,
      viewedUrl: location.href,
      diagnostics: payload.diagnostics ?? ['Extraction failed.'],
      error: payload.error ?? 'No normalized post available for export.',
      errorCode: 'EXTRACTION_FAILED',
    };
  }
  const post = lastExtraction.normalizedPost;
  const mediaPlan = collectMediaPlan(post);
  const diagnostics = [...(payload.diagnostics ?? [])];
  diagnostics.push(`Media plan: ${mediaPlan.length} item(s) selected (images/posters/filmstrips).`);
  return { ok: true, viewedUrl: location.href, post, mediaPlan, diagnostics };
}

browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === MessageType.GET_POST_STATUS) {
    const payload = detectTumblrPost();
    return Promise.resolve({ type: MessageType.POST_STATUS, payload } satisfies ExtensionMessage);
  }
  if (message.type === MessageType.DEBUG_EXTRACT_POST) {
    const payload = extractCurrentPost();
    return Promise.resolve({ type: MessageType.EXTRACTION_RESULT, payload } satisfies ExtensionMessage);
  }
  if (message.type === MessageType.DEBUG_LAST_EXTRACTION) {
    return Promise.resolve({ type: MessageType.EXTRACTION_RESULT, payload: lastExtraction ? summarizeExtraction(lastExtraction) : { ok: false, viewedUrl: location.href, diagnostics: ['No extraction has been run on this page yet.'], error: 'No cached extraction.' } } satisfies ExtensionMessage);
  }
  if (message.type === MessageType.PREPARE_EXPORT) {
    const payload = prepareExport();
    return Promise.resolve({ type: MessageType.EXPORT_PREPARED, payload } satisfies ExtensionMessage);
  }
  if (message.type === MessageType.EXPORT_CURRENT_POST) {
    // Back-compat: popup/background should use PREPARE_EXPORT + background pipeline.
    const prepared = prepareExport();
    return Promise.resolve({
      type: MessageType.EXPORT_PREPARED,
      payload: prepared,
    } satisfies ExtensionMessage);
  }
  return undefined;
});

