import { detectMediaType, extensionForMediaType } from '../../src/media/index';
import { collectMediaPlan, assignAssetPaths } from '../../src/media/plan';
import type { NormalizedPost } from '../../src/tumblr/types';
import { describe, expect, it } from 'vitest';

function b(...bytes: number[]): Uint8Array { return new Uint8Array(bytes); }

describe('media type detection', () => {
  it('detects GIF signature and preserves animation-agnostic GIF type', () => {
    const gif = b(0x47,0x49,0x46,0x38,0x39,0x61, 0,0,0,0);
    const d = detectMediaType(gif, 'image/webp'); // declared wrong (common .gifv)
    expect(d.type).toBe('image/gif');
    expect(d.confidence).toBe('signature');
  });

  it('detects RIFF WEBP', () => {
    const webp = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
    expect(detectMediaType(webp).type).toBe('image/webp');
  });

  it('falls back to header then octet-stream', () => {
    expect(detectMediaType(b(1,2,3,4), 'image/png; charset=binary').type).toBe('image/png');
    expect(detectMediaType(b(1,2,3,4), null).type).toBe('application/octet-stream');
  });

  it('maps extensions from actual media type', () => {
    expect(extensionForMediaType('image/gif')).toBe('gif');
    expect(extensionForMediaType('image/jpeg')).toBe('jpg');
  });
});

describe('media planning', () => {
  const post: NormalizedPost = {
    id: '1',
    blogName: 'b',
    tags: [],
    content: [
      { kind: 'image', media: [{ url: 'https://64.media.tumblr.com/a.gif', declaredType: 'image/webp' }, { url: 'https://64.media.tumblr.com/a-small.gif', declaredType: 'image/webp', width: 100 }], altText: 'a' },
      { kind: 'audio', provider: 'tumblr', url: 'https://a.tumblr.com/x.mp3', media: { url: 'https://a.tumblr.com/x.mp3', declaredType: 'audio/mpeg' }, poster: [{ url: 'https://64.media.tumblr.com/poster.jpg' }], embedHtmlIgnored: true },
      { kind: 'video', provider: 'tumblr', url: 'https://v.tumblr.com/x.mp4', media: { url: 'https://v.tumblr.com/x.mp4', declaredType: 'video/mp4' }, poster: [{ url: 'https://64.media.tumblr.com/poster.jpg' }], embedHtmlIgnored: true },
    ],
    layout: [],
    trail: [{ blogName: 't', content: [{ kind: 'image', media: [{ url: 'https://64.media.tumblr.com/trail.png' }] }], layout: [], unknowns: [] }],
    unknowns: [],
  };

  it('collects selected image, audio, video, and poster candidates across root and trail', () => {
    const plan = collectMediaPlan(post);
    expect(plan.map((p) => p.url)).toEqual([
      'https://64.media.tumblr.com/a.gif',
      'https://a.tumblr.com/x.mp3',
      'https://64.media.tumblr.com/poster.jpg',
      'https://v.tumblr.com/x.mp4',
      'https://64.media.tumblr.com/poster.jpg',
      'https://64.media.tumblr.com/trail.png',
    ]);
  });

  it('dedupes by URL and assigns stable asset paths', () => {
    const reg = assignAssetPaths([
      { url: 'https://x/a.gif', mediaType: 'image/gif', bytes: b(1) },
      { url: 'https://x/a.gif', mediaType: 'image/gif', bytes: b(2) }, // duplicate source URL
      { url: 'https://x/b', mediaType: 'image/png', bytes: b(3) },
    ]);
    expect(reg.assets).toHaveLength(2);
    expect(reg.byUrl.get('https://x/a.gif')).toMatch(/^assets\/.*\.gif$/);
    expect(reg.byUrl.get('https://x/b')).toMatch(/^assets\/.*\.png$/);
  });
});
