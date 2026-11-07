import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NormalizedPost, RawTumblrPageEnvelope } from '../../src/tumblr/types';

const fixturesDir = path.resolve(__dirname, '../fixtures/raw');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8')) as T;
}

describe('curated fixtures', () => {
  it('loads the catalog and every referenced fixture', () => {
    const catalog = readJson<{ fixtures: Array<{ out: string; postCount: number }> }>('CATALOG.json');
    expect(catalog.fixtures.length).toBeGreaterThanOrEqual(11);
    for (const entry of catalog.fixtures) {
      const fixture = readJson<{ posts: unknown[] }>(entry.out);
      expect(Array.isArray(fixture.posts)).toBe(true);
      expect(fixture.posts.length).toBe(entry.postCount);
    }
  });

  it('does not include obvious sensitive session fields', () => {
    const names = readdirSync(fixturesDir).filter((n) => n.endsWith('.json') && n !== 'CATALOG.json');
    for (const name of names) {
      const raw = readFileSync(path.join(fixturesDir, name), 'utf8');
      expect(raw).not.toContain('"queries"');
      expect(raw).not.toContain('spicatamentha@outlook.com');
      expect(raw).not.toContain('"adUuid"');
      expect(raw).not.toContain('"membershipsId"');
      expect(raw).not.toContain('"placementId"');
    }
  });

  it('covers key structural cases needed before parser implementation', () => {
    const longReblog = readJson<RawTumblrPageEnvelope & { posts: any[] }>('text-formatting-long-reblog-trail.json');
    expect(longReblog.posts[0].content).toEqual([]);
    expect(longReblog.posts[0].trail.length).toBeGreaterThan(0);

    const chat = readJson<{ posts: any[] }>('chat-root-content.json');
    expect(chat.posts[0].trail).toEqual([]);
    expect(chat.posts[0].content.some((b: any) => b.subtype === 'chat')).toBe(true);

    const ask = readJson<{ posts: any[] }>('ask-layout.json');
    expect(ask.posts[0].trail[0].layout.some((l: any) => l.type === 'ask')).toBe(true);
    expect(ask.posts[0].trail[0].content[0].type).toBe('text');

    const rows = readJson<{ posts: any[] }>('image-rows-gifv-colors.json');
    expect(rows.posts[0].trail[0].layout.some((l: any) => l.type === 'rows')).toBe(true);

    const poll = readJson<{ posts: any[] }>('poll.json');
    expect(poll.posts[0].content.some((b: any) => b.type === 'poll')).toBe(true);

    const condensed = readJson<{ posts: any[] }>('condensed-truncate-color-links.json');
    expect(condensed.posts[0].content).toEqual([]);
    const condensedLayout = condensed.posts[0].trail[0].layout;
    expect(condensedLayout.some((l: any) => l.type === 'rows' && l.truncateAfter === 13)).toBe(true);
    expect(condensedLayout.some((l: any) => l.type === 'condensed' && l.truncateAfter === 13 && Array.isArray(l.blocks))).toBe(true);
    const colorBlock = condensed.posts[0].trail[0].content.find((b: any) => b?.formatting?.some((f: any) => f.type === 'color'));
    expect(colorBlock?.formatting?.some((f: any) => f.type === 'bold')).toBe(true);
    expect(colorBlock?.formatting?.some((f: any) => f.type === 'color' && typeof f.hex === 'string')).toBe(true);
    expect(condensed.posts[0].trail[0].content.some((b: any) => b.subtype === 'ordered-list-item' && b.formatting?.some((f: any) => f.type === 'link'))).toBe(true);

    const linkBlock = readJson<{ posts: any[] }>('link-block-root-content.json');
    expect(linkBlock.posts[0].trail).toEqual([]);
    const blockLink = linkBlock.posts[0].content.find((b: any) => b.type === 'link');
    expect(blockLink?.url).toContain('http');
    expect(blockLink?.title).toBeTruthy();
    expect(Array.isArray(blockLink?.poster)).toBe(true);

    const privateFormatted = readJson<{ posts: any[] }>('inline-formatting-subtypes-private.json');
    expect(privateFormatted.posts[0].state).toBe('private');
    expect(privateFormatted.posts[0].trail).toEqual([]);
    const subtypes = privateFormatted.posts[0].content.map((b: any) => b.subtype).filter(Boolean);
    expect(subtypes).toEqual(expect.arrayContaining(['heading1', 'heading2', 'quote', 'chat', 'quirky', 'indented', 'unordered-list-item', 'ordered-list-item']));
    const formats = privateFormatted.posts[0].content.flatMap((b: any) => b.formatting ?? []).map((f: any) => f.type);
    expect(formats).toEqual(expect.arrayContaining(['strikethrough', 'bold', 'italic', 'small', 'link', 'color']));
    expect(privateFormatted.posts[0].content.some((b: any) => b.formatting?.some((f: any) => f.type === 'color' && f.hex))).toBe(true);

    const unknown = readJson<{ posts: any[] }>('unknown-future-block.json');
    expect(unknown.posts[0].content.some((b: any) => b.type === 'mystery_block_2099')).toBe(true);
  });

  it('accepts a minimal normalized shape for type-level smoke testing', () => {
    const sample: NormalizedPost = {
      id: '1',
      tags: [],
      content: [{ kind: 'text', text: 'hello', formatting: [] }],
      trail: [],
      layout: [],
      unknowns: []
    };
    expect(sample.content[0].kind).toBe('text');
  });
});
