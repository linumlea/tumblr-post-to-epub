import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSanitizedPost } from '../../src/tumblr/parser';
import { renderPostDocument, renderPostBodyXhtml, renderContentBlocks } from '../../src/epub/xhtml-renderer';
import type { SanitizedPost } from '../../src/tumblr/extract-types';
import type { NormalizedPost } from '../../src/tumblr/types';

function fixture(name: string): SanitizedPost {
  return JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/raw', name), 'utf8')).posts[0] as SanitizedPost;
}
function normalized(name: string): NormalizedPost {
  return parseSanitizedPost(fixture(name)).post;
}

describe('XHTML renderer', () => {
  it('escapes text and never injects embed HTML', () => {
    const post = normalized('audio-rows.json');
    // Mutate a text block to prove escaping; audio block must not render embed HTML.
    const textBlock = post.trail[0].content.find((b) => b.kind === 'text') as any;
    textBlock.text = '<script>alert(1)</script> & "x"';
    textBlock.formatting = [];
    const html = renderPostDocument(post).xhtml;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('embedHtml');
  });

  it('renders text subtypes, inline formatting, and mentions safely', () => {
    const html = renderPostDocument(normalized('inline-formatting-subtypes-private.json')).xhtml;
    expect(html).toContain('<h1>');
    expect(html).toContain('<h2>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<s>');
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
    expect(html).toContain('style="color:');
    expect(html).toContain('class="chat-block"');
  });

  it('renders overlapping/adjacent formatting and preserves Unicode text', () => {
    const diagnostics: string[] = [];
    const html = renderContentBlocks([{
      kind: 'text',
      text: 'hello 😀 world',
      subtype: undefined,
      formatting: [
        { type: 'bold', start: 0, end: 8 },
        { type: 'italic', start: 6, end: 10 },
        { type: 'link', start: 6, end: 10, url: 'https://example.com/path?a=1&b=2' },
      ],
    }], [], diagnostics, 'root');
    expect(html).toContain('😀');
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
    expect(html).toContain('href="https://example.com/path?a=1&amp;b=2"');
    expect(html).not.toContain('undefined');
  });

  it('renders image blocks with placeholder local paths and alt text', () => {
    const html = renderPostDocument(normalized('image-rows-gifv-colors.json')).xhtml;
    expect(html).toMatch(/<img src="assets\/[^"]+"/);
    expect(html).toContain('alt=');
  });

  it('renders image alt text visibly when present', () => {
    const post = normalized('link-block-root-content.json');
    const withImg = { ...post, content: [{ kind: 'image' as const, media: [{ url: 'https://m/a.jpg' }], altText: 'Visible alt text', caption: 'A caption' }, ...post.content] };
    const html = renderPostBodyXhtml(withImg).body;
    expect(html).toContain('class="image-alt"');
    expect(html).toContain('Visible alt text');
    expect(html).toContain('<figcaption>A caption</figcaption>');
  });

  it('does not duplicate alt text when it equals the caption', () => {
    const post = normalized('link-block-root-content.json');
    const withImg = { ...post, content: [{ kind: 'image' as const, media: [{ url: 'https://m/a.jpg' }], altText: 'Same text', caption: 'Same text' }, ...post.content] };
    const html = renderPostBodyXhtml(withImg).body;
    const matches = html.match(/class="image-alt"/g) || [];
    expect(matches.length).toBe(0);
  });

  it('renders block-form links as clickable safe links', () => {
    const html = renderPostDocument(normalized('link-block-root-content.json')).xhtml;
    expect(html).toContain('class="link-card"');
    expect(html).toContain('<a href="https://');
  });

  it('renders audio/video blocks as metadata/poster fallbacks without embeds', () => {
    const audioHtml = renderPostDocument(normalized('audio-rows.json')).xhtml;
    expect(audioHtml).toContain('class="media-block audio-block"');
    expect(audioHtml).toContain('Haikyuu!! - Current Concerns');
    expect(audioHtml).not.toContain('embedHtml');
    expect(audioHtml).not.toContain('<iframe');

    const videoHtml = renderPostDocument(normalized('multi-trail-video-link.json')).xhtml;
    expect(videoHtml).toContain('class="media-block video-block"');
    expect(videoHtml).toContain('Original video');
    expect(videoHtml).not.toContain('<iframe');
  });

  it('embeds audio/video files when the user enables the option', () => {
    const audioHtml = renderPostDocument(normalized('audio-rows.json'), {
      resolveMediaUrl: () => '../assets/track.mp3',
      embedMedia: true,
    }).xhtml;
    expect(audioHtml).toContain('<audio controls="controls"');
    expect(audioHtml).toContain('src="../assets/track.mp3"');

    const videoHtml = renderPostDocument(normalized('multi-trail-video-link.json'), {
      resolveMediaUrl: () => '../assets/video.mp4',
      embedMedia: true,
    }).xhtml;
    expect(videoHtml).toContain('<video controls="controls"');
    expect(videoHtml).toContain('src="../assets/video.mp4"');
  });

  it('renders poll as read-only content', () => {
    const html = renderPostDocument(normalized('poll.json')).xhtml;
    expect(html).toContain('class="poll-block"');
    expect(html).toContain('<ul>');
    expect(html).toContain('read-only');
  });

  it('renders ask layout and trail attribution/order', () => {
    const askHtml = renderPostDocument(normalized('ask-layout.json')).xhtml;
    expect(askHtml).toContain('class="ask-block"');

    const trailHtml = renderPostDocument(normalized('multi-trail-video-link.json')).xhtml;
    const first = trailHtml.indexOf('class="trail-entry"');
    const second = trailHtml.indexOf('class="trail-entry"', first + 1);
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it('renders trail timestamps when available', () => {
    const html = renderPostBodyXhtml(normalized('multi-trail-video-link.json')).body;
    expect(html).toContain('trail-attribution');
    expect(html).toContain('2025-10-11'); // 1760204471
    expect(html).toContain('#797132163487334400');
  });

  it('renders exporting-blog addition after trail when root content and trail both exist', () => {
    const post: NormalizedPost = {
      id: '999', blogName: 'extracting-blog', timestamp: 1794060002, tags: [],
      content: [{ kind: 'text', text: 'My newest addition', formatting: [] }],
      layout: [],
      trail: [
        { blogName: 'older-blog', timestamp: 1760204471, postId: '1', content: [{ kind: 'text', text: 'Older post', formatting: [] }], layout: [], unknowns: [] },
        { blogName: 'middle-blog', timestamp: 1763529837, postId: '2', content: [{ kind: 'text', text: 'Middle reply', formatting: [] }], layout: [], unknowns: [] },
      ],
      unknowns: [],
    };
    const html = renderPostBodyXhtml(post).body;
    expect(html.indexOf('Older post')).toBeLessThan(html.indexOf('Middle reply'));
    expect(html.indexOf('Middle reply')).toBeLessThan(html.indexOf('My newest addition'));
    expect(html).toMatch(/extracting-blog[\s\S]*2026-11-07[\s\S]*My newest addition/);
  });

  it('renders condensed/read-more boundary signals without losing content', () => {
    const post = normalized('condensed-truncate-color-links.json');
    const html = renderPostDocument(post).xhtml;
    expect(html).toContain('Read More boundary');
    expect(html).toContain('One Pagers'); // content after truncateAfter in fixture
  });

  it('renders unknown blocks/layouts as visible fallbacks', () => {
    const html = renderPostDocument(normalized('unknown-future-block.json')).xhtml;
    expect(html).toContain('Unsupported content block');
    expect(html).toContain('mystery_block_2099');
  });

  it('emits a complete XHTML document with stylesheet link', () => {
    const doc = renderPostDocument(normalized('chat-root-content.json'));
    expect(doc.xhtml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(doc.xhtml).toContain('<!DOCTYPE html>');
    expect(doc.xhtml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(doc.xhtml).toContain('href="../styles/style.css"');
    expect(doc.filenameBase).toMatch(/^tumblr-/);
  });
  it('uses resolveMediaUrl for image assets and keeps safe fallback', () => {
    const post = normalized('link-block-root-content.json');
    const withImg: NormalizedPost = { ...post, content: [{ kind: 'image', media: [{ url: 'https://m/a.jpg' }], altText: 'x' }, ...post.content] };
    const html = renderPostBodyXhtml(withImg, { resolveMediaUrl: (u) => u.endsWith('a.jpg') ? '../assets/001-image.jpg' : undefined }).body;
    expect(html).toContain('src="../assets/001-image.jpg"');
    expect(html).toContain('alt="x"');
  });

  it('renders tags at the end for regular (non-trail) posts', () => {
    const post = { ...normalized('chat-root-content.json'), tags: ['one', 'two'] };
    const html = renderPostBodyXhtml(post).body;
    expect(html.indexOf('class="post-content')).toBeLessThan(html.indexOf('class="post-tags"'));
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('class="post-meta"'));
  });

  it('renders sourceUrl/sourceTitle metadata when present', () => {
    const post = { ...normalized('chat-root-content.json'), sourceUrl: 'https://example.com/source', sourceTitle: 'Example Source' };
    const html = renderPostBodyXhtml(post).body;
    expect(html).toContain('Original source:');
    expect(html).toContain('href="https://example.com/source"');
    expect(html).toContain('Example Source');
    expect(html.indexOf('Original source:')).toBeGreaterThan(-1);
  });

  it('renders trail-level source metadata inside the matching reblog section', () => {
    const post: NormalizedPost = {
      id: 'reblog-source-test',
      blogName: 'root-blog',
      tags: [],
      content: [],
      layout: [],
      trail: [
        {
          blogName: 'first-blog',
          content: [{ kind: 'text', text: 'First reblog text', formatting: [] }],
          layout: [],
          sourceUrl: 'https://example.com/first-source',
          sourceTitle: 'First Source',
          unknowns: [],
        },
        {
          blogName: 'second-blog',
          content: [{ kind: 'text', text: 'Second reblog text', formatting: [] }],
          layout: [],
          unknowns: [],
        },
      ],
      unknowns: [],
    };
    const html = renderPostBodyXhtml(post).body;
    expect(html).toContain('Original source:');
    expect(html).toContain('href="https://example.com/first-source"');
    expect(html).toContain('First Source');
    expect(html.indexOf('First Source')).toBeLessThan(html.indexOf('Second reblog text'));
  });

  it('renders root source metadata in the original-post section when the root has no content blocks', () => {
    const post: NormalizedPost = {
      id: 'root-source-no-content',
      blogName: 'root-blog',
      sourceUrl: 'https://www.tiktok.com/t/ZThfmyW8w/',
      sourceTitle: 'tiktok.com',
      tags: [],
      content: [],
      layout: [],
      trail: [
        { blogName: 'reblogger', content: [{ kind: 'text', text: 'Reblog text', formatting: [] }], layout: [], unknowns: [] },
      ],
      unknowns: [],
    };
    const html = renderPostBodyXhtml(post).body;
    expect(html).toContain('Original source:');
    expect(html).toContain('href="https://www.tiktok.com/t/ZThfmyW8w/"');
    expect(html).toContain('tiktok.com');
    expect(html.indexOf('Original source:')).toBeLessThan(html.indexOf('Reblog text'));
  });
});
