import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectPostObjects, detectBodyLocation, extractViewedPostFromPage, sanitizePost } from '../../src/tumblr/extract';
import { deriveMatchInput } from '../../src/tumblr/post-match';

function readRaw(name: string): any {
  return JSON.parse(readFileSync(path.resolve(__dirname, '../../../post-examples', name), 'utf8'));
}

describe('extraction/sanitization', () => {
  it('collects post objects from Peepr hydration envelopes', () => {
    const groups = collectPostObjects(readRaw('post22.json'));
    expect(groups.flatMap((g) => g.posts).length).toBeGreaterThanOrEqual(1);
    expect(groups[0].path).toContain('initialTimeline.objects');
  });

  it('extracts a trail-only post body and preserves trail order metadata', () => {
    const result = extractViewedPostFromPage(readRaw('post.json'), deriveMatchInput('https://www.tumblr.com/someblog/163424009159'));
    expect(result.ok).toBe(true);
    expect(result.bodyLocation).toBe('trail');
    expect(result.post?.content).toEqual([]);
    expect((result.post?.trail?.length ?? 0)).toBeGreaterThan(0);
  });

  it('extracts a root-content post with empty trail', () => {
    const result = extractViewedPostFromPage(readRaw('post23.json'), deriveMatchInput('https://www.tumblr.com/senoraconstelacionesdeinvierno/743688943605776384'));
    expect(result.ok).toBe(true);
    expect(result.bodyLocation).toBe('root');
    expect(result.post?.trail).toEqual([]);
    expect(result.post?.content?.some((b: any) => b.type === 'link')).toBe(true);
  });

  it('sanitizes sensitive top-level/session data', () => {
    const raw = readRaw('post22.json');
    raw.PeeprRoute.initialTimeline.objects[0].queries = [{ secret: true }];
    const result = extractViewedPostFromPage(raw, deriveMatchInput('https://www.tumblr.com/caelanthe/832567782432440320'));
    expect(result.ok).toBe(true);
    const text = JSON.stringify(result);
    expect(text).not.toContain('"queries"');
    expect(text).not.toContain('adUuid');
  });

  it('sanitizePost keeps post fields and drops unknown top-level cruft', () => {
    const rawPost = { objectType: 'post', id: '1', blogName: 'x', content: [], trail: [], queries: { bad: true }, someSession: 'x' } as any;
    const sanitized = sanitizePost(rawPost);
    expect(JSON.stringify(sanitized)).not.toContain('queries');
    expect(JSON.stringify(sanitized)).not.toContain('someSession');
    expect(sanitized.blogName).toBe('x');
  });

  it('reports ambiguity explicitly for multi-post timelines without a confident match', () => {
    const raw = {
      PeeprRoute: {
        initialTimeline: {
          objects: [
            { objectType: 'post', id: '11', idString: '11', blogName: 'a', postUrl: 'https://a.tumblr.com/post/11', content: [{ type: 'text', text: 'a' }], trail: [] },
            { objectType: 'post', id: '22', idString: '22', blogName: 'b', postUrl: 'https://b.tumblr.com/post/22', content: [{ type: 'text', text: 'b' }], trail: [] },
          ],
        },
      },
    };
    const result = extractViewedPostFromPage(raw, deriveMatchInput('https://www.tumblr.com/dashboard'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Ambiguous');
    expect(result.candidatesCount).toBe(2);
  });

  it('detects body location combinations', () => {
    expect(detectBodyLocation({ content: [{ type: 'text' }] as any, trail: [] })).toBe('root');
    expect(detectBodyLocation({ content: [], trail: [{ content: [{ type: 'text' }] }] as any })).toBe('trail');
    expect(detectBodyLocation({ content: [{ type: 'text' }] as any, trail: [{ content: [{ type: 'text' }] }] as any })).toBe('root+trail');
    expect(detectBodyLocation({ content: [], trail: [] })).toBe('none');
  });
});
