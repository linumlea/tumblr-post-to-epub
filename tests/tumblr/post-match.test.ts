import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveMatchInput, matchViewedPost } from '../../src/tumblr/post-match';
import type { RawPostObject } from '../../src/tumblr/types';

function readRaw(name: string): any {
  return JSON.parse(readFileSync(path.resolve(__dirname, '../../../post-examples', name), 'utf8'));
}

function postsFromCapture(name: string): RawPostObject[] {
  const raw = readRaw(name);
  return (raw?.PeeprRoute?.initialTimeline?.objects ?? []).filter((o: any) => o?.objectType === 'post');
}

describe('post matching', () => {
  it('derives hints from Tumblr permalink URLs', () => {
    const input = deriveMatchInput('https://www.tumblr.com/caelanthe/832641494194225152/fkwe');
    expect(input.postIdHint).toBe('832641494194225152');
    expect(input.blogNameHint).toBe('caelanthe');
    expect(input.slugHint).toBe('fkwe');
  });

  it('matches a post by id when canonical URL differs from viewed reblog URL', () => {
    const posts = postsFromCapture('post22.json');
    const input = deriveMatchInput('https://www.tumblr.com/caelanthe/832567782432440320');
    const result = matchViewedPost(posts, input);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(String(result.matched.idString ?? result.matched.id)).toBe('832567782432440320');
    expect(result.confidence).toBe('high');
  });

  it('selects a single candidate without ambiguity', () => {
    const posts = postsFromCapture('post23.json');
    const result = matchViewedPost(posts, { viewedUrl: 'https://www.tumblr.com/somewhere/743688943605776384', postIdHint: '743688943605776384' });
    expect('error' in result).toBe(false);
  });

  it('returns an explicit ambiguity error when candidates cannot be distinguished', () => {
    const a = { objectType: 'post', id: '1', idString: '1', blogName: 'a', postUrl: 'https://a.tumblr.com/post/1', content: [], trail: [] } as RawPostObject;
    const b = { objectType: 'post', id: '2', idString: '2', blogName: 'b', postUrl: 'https://b.tumblr.com/post/2', content: [], trail: [] } as RawPostObject;
    const result = matchViewedPost([a, b], { viewedUrl: 'https://www.tumblr.com/dashboard' });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.candidates).toHaveLength(2);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
