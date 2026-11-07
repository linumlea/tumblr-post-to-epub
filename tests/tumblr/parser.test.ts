import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bestMedia } from '../../src/tumblr/media-parser';
import { parseLayouts } from '../../src/tumblr/layout-parser';
import {
  parseAudioBlock,
  parseContentBlock,
  parseImageBlock,
  parsePaywallBlock,
  parsePollBlock,
  parseSanitizedPost,
  parseTextBlock,
  parseVideoBlock,
} from '../../src/tumblr/parser';
import { normalizeFormatting, segmentFormattedText } from '../../src/tumblr/text-parser';
import type { SanitizedPost } from '../../src/tumblr/extract-types';

function fixture(name: string): SanitizedPost {
  return JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/raw', name), 'utf8')).posts[0] as SanitizedPost;
}

describe('text parser / formatting', () => {
  it('normalizes and clamps formatting ranges', () => {
    const text = 'abcdef';
    const fmt = normalizeFormatting([
      { type: 'bold', start: -5, end: 3 },
      { type: 'italic', start: 2, end: 99 },
      { type: 'bad' },
      { type: 'zero', start: 2, end: 2 },
    ], text.length);
    expect(fmt).toEqual([
      { type: 'bold', start: 0, end: 3, url: undefined, blogName: undefined, hex: undefined, raw: { type: 'bold', start: -5, end: 3 } },
      { type: 'italic', start: 2, end: 6, url: undefined, blogName: undefined, hex: undefined, raw: { type: 'italic', start: 2, end: 99 } },
    ]);
  });

  it('segments overlapping and adjacent ranges without mutating text', () => {
    const text = 'hello 😀 world';
    const formatting = normalizeFormatting([
      { type: 'bold', start: 0, end: 8 },
      { type: 'italic', start: 6, end: 10 },
      { type: 'link', start: 6, end: 10, url: 'https://example.com' },
    ], text.length);
    const segments = segmentFormattedText(text, formatting);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    const overlap = segments.find((s) => s.text.includes('😀'));
    expect(overlap?.formatting.map((f) => f.type)).toEqual(['bold', 'italic', 'link']);
  });
});

describe('block parsers', () => {
  it('parses text subtypes and formatting', () => {
    const block = parseTextBlock({
      type: 'text',
      subtype: 'heading2',
      text: 'Title',
      formatting: [{ type: 'color', start: 0, end: 5, hex: '#ff0000' }],
    } as any);
    expect(block.kind).toBe('text');
    expect(block.subtype).toBe('heading2');
    expect(block.formatting[0]).toMatchObject({ type: 'color', hex: '#ff0000', start: 0, end: 5 });
  });

  it('parses images and chooses best media candidate', () => {
    const block = parseImageBlock({
      type: 'image',
      alt_text: 'alt',
      media: [
        { url: 'https://example.com/small.webp', type: 'image/webp', width: 100, height: 100 },
        { url: 'https://example.com/big.webp', type: 'image/webp', width: 1200, height: 800, hasOriginalDimensions: true },
      ],
    } as any);
    expect(block.kind).toBe('image');
    expect(block.altText).toBe('alt');
    expect(bestMedia(block.media)?.url).toContain('big');
  });

  it('parses block-form links including poster metadata', () => {
    const post = fixture('link-block-root-content.json');
    const parsed = parseSanitizedPost(post);
    const link = parsed.post.content.find((b) => b.kind === 'link') as any;
    expect(link?.url).toContain('pajiba');
    expect(link?.title).toContain('Harry Potter');
    expect(link?.poster?.[0]?.url).toContain('media.tumblr.com');
  });

  it('parses audio/video and marks embed HTML as ignored (never rendered)', () => {
    const unknowns: any[] = [];
    const audio = parseAudioBlock({ type: 'audio', provider: 'tumblr', title: 'Track', embedHtml: '<iframe src=x></iframe>', media: { url: 'https://a.tumblr.com/a.mp3', type: 'audio/mpeg' }, poster: [{ url: 'https://m/p.jpg' }] } as any, 'content[0]', unknowns);
    expect(audio.embedHtmlIgnored).toBe(true);
    expect(audio.media?.url).toContain('.mp3');
    expect(unknowns.some((u) => u.type === 'ignored:embed-html')).toBe(true);

    const unknowns2: any[] = [];
    const video = parseVideoBlock({ type: 'video', provider: 'tumblr', media: { url: 'https://v/media.mp4', type: 'video/mp4' }, poster: [{ url: 'https://m/poster.jpg' }], filmstrip: { url: 'https://m/film.jpg' } } as any, 'content[1]', unknowns2);
    expect(video.filmstrip?.url).toContain('film');
    expect(video.embedHtmlIgnored).toBe(false);
  });

  it('parses polls as read-only data', () => {
    const poll = parsePollBlock({ type: 'poll', question: 'Q?', answers: [{ client_id: 'a', answer_text: 'A' }, { answerText: 'B' }], settings: { multipleChoice: false }, timestamp: 123 } as any);
    expect(poll.kind).toBe('poll');
    expect(poll.answers.map((a) => a.answerText)).toEqual(['A', 'B']);
    expect(poll.settings).toMatchObject({ multipleChoice: false });
  });

  it('parses paywall blocks without bypassing content', () => {
    const paywall = parsePaywallBlock({ type: 'paywall', subtype: 'divider', title: 'Support', text: 'More below' } as any);
    expect(paywall).toMatchObject({ kind: 'paywall', subtype: 'divider', title: 'Support', text: 'More below' });
  });

  it('falls back for unknown/invalid blocks without throwing', () => {
    const unknowns: any[] = [];
    const block = parseContentBlock({ type: 'mystery_block_2099', foo: 'bar', url: 'https://example.com' }, 'content[1]', unknowns);
    expect(block.kind).toBe('unknown');
    if (block.kind === 'unknown') expect(block.textFallback).toContain('mystery_block_2099');
    expect(unknowns).toEqual([{ path: 'content[1]', type: 'block:mystery_block_2099', keys: ['type', 'foo', 'url'] }]);
  });
});

describe('layout/trail/post parsing', () => {
  it('parses rows, ask, condensed, and unknown layouts', () => {
    const unknowns: any[] = [];
    const layouts = parseLayouts([
      { type: 'rows', display: [{ blocks: [0, 1] }], truncateAfter: 13 },
      { type: 'ask', blocks: [0], attribution: { blog: { name: 'asker' } } },
      { type: 'condensed', blocks: [0, 1], truncateAfter: 13 },
      { type: 'future', foo: 1 },
    ], 'layout', unknowns);
    expect(layouts.map((l) => l.type)).toEqual(['rows', 'ask', 'condensed', 'unknown']);
    expect((layouts[0] as any).truncateAfter).toBe(13);
    expect((layouts[2] as any).blocks).toEqual([0, 1]);
    expect(unknowns.some((u) => u.type === 'layout:future')).toBe(true);
  });

  it('preserves trail-only body and metadata', () => {
    const parsed = parseSanitizedPost(fixture('text-formatting-long-reblog-trail.json'));
    expect(parsed.post.content).toEqual([]);
    expect(parsed.post.trail.length).toBeGreaterThan(0);
    expect(parsed.post.trail[0].content.length).toBeGreaterThan(0);
  });

  it('preserves multi-trail order and mixed block types', () => {
    const parsed = parseSanitizedPost(fixture('multi-trail-video-link.json'));
    expect(parsed.post.trail.length).toBeGreaterThan(1);
    expect(parsed.post.trail[0].content[0]?.kind).toBe('video');
    expect(parsed.post.trail.map((t) => t.blogName)).toEqual(['walerihq', 'crazy-pages', 'long-delirious-burning-blue']);
    expect(parsed.post.trail[2].content.some((b) => b.kind === 'text' && 'text' in b && b.formatting.some((f) => f.type === 'link'))).toBe(true);
  });

  it('parses root-content posts, tags, and rich text/list subtypes', () => {
    const parsed = parseSanitizedPost(fixture('inline-formatting-subtypes-private.json'));
    expect(parsed.post.trail).toEqual([]);
    expect(parsed.post.content.some((b) => b.kind === 'text' && b.subtype === 'ordered-list-item')).toBe(true);
    expect(parsed.post.content.some((b) => b.kind === 'text' && b.formatting.some((f) => f.type === 'strikethrough'))).toBe(true);
    expect(parsed.post.content.some((b) => b.kind === 'text' && b.formatting.some((f) => f.type === 'color' && f.hex))).toBe(true);
  });

  it('parses ask layout fixtures', () => {
    const parsed = parseSanitizedPost(fixture('ask-layout.json'));
    expect(parsed.post.trail[0].layout.some((l) => l.type === 'ask')).toBe(true);
  });

  it('parses poll fixtures', () => {
    const parsed = parseSanitizedPost(fixture('poll.json'));
    expect(parsed.post.content[0]?.kind).toBe('poll');
    if (parsed.post.content[0]?.kind === 'poll') expect(parsed.post.content[0].answers.length).toBe(12);
  });

  it('keeps unknown future blocks observable in normalized output', () => {
    const parsed = parseSanitizedPost(fixture('unknown-future-block.json'));
    expect(parsed.post.content.some((b) => b.kind === 'unknown')).toBe(true);
    expect(parsed.post.unknowns.some((u) => u.type === 'block:mystery_block_2099')).toBe(true);
  });
});
