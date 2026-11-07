import { describe, expect, it } from 'vitest';
import { buildStoredZip, decodeUtf8 } from '../../src/epub/zip';
import { packageEpub } from '../../src/epub/package';
import { runExportPipeline } from '../../src/epub/pipeline';
import type { NormalizedPost } from '../../src/tumblr/types';
import type { MediaPlanItem } from '../../src/media/index';

function zipEntryNames(zip: Uint8Array): string[] {
  const text = Array.from(zip).map((b) => String.fromCharCode(b)).join('');
  // central directory file names appear after PK\x01\x02 headers; simple scan
  const names: string[] = [];
  let i = 0;
  while (i + 30 <= zip.length) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x03 && zip[i + 3] === 0x04) {
      const nlen = zip[i + 26] | (zip[i + 27] << 8);
      const xlen = zip[i + 28] | (zip[i + 29] << 8);
      const clen = zip[i + 18] | (zip[i + 19] << 8) | (zip[i + 20] << 16) | (zip[i + 21] << 24);
      names.push(decodeUtf8(zip.slice(i + 30, i + 30 + nlen)));
      i += 30 + nlen + xlen + clen;
    } else i++;
  }
  return names;
}

describe('epub zip/package', () => {
  it('stores mimetype first and uncompressed with correct content', () => {
    const zip = buildStoredZip([{ name: 'mimetype', data: new TextEncoder().encode('application/epub+zip') }, { name: 'META-INF/container.xml', data: new TextEncoder().encode('x') }]);
    expect(zip[0]).toBe(0x50); expect(zip[1]).toBe(0x4b);
    expect(decodeUtf8(zip.slice(30, 38))).toBe('mimetype');
    expect(decodeUtf8(zip.slice(38, 58))).toBe('application/epub+zip');
  });

  it('packages required EPUB entries and assets', () => {
    const epub = packageEpub({
      title: 'T', filenameBase: 't', xhtml: '<html xmlns="http://www.w3.org/1999/xhtml"><body>x</body></html>',
      assets: [{ path: 'assets/001-image.gif', bytes: new Uint8Array([71,73,70,56,57,97]), mediaType: 'image/gif', sourceUrl: 'https://m/a.gif' }],
    });
    const names = zipEntryNames(epub);
    expect(names[0]).toBe('mimetype');
    expect(names).toEqual(expect.arrayContaining(['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/content/nav.xhtml', 'OEBPS/content/post.xhtml', 'OEBPS/styles/style.css', 'OEBPS/assets/001-image.gif']));
  });
});

describe('export pipeline', () => {
  it('downloads media, corrects declared type from bytes, dedupes, and renders resolved assets', async () => {
    const gif = new Uint8Array([0x47,0x49,0x46,0x38,0x39,0x61,0,0,0,0]);
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(gif, { status: 200, headers: { 'content-type': 'image/webp' } }); // wrong header vs signature
    };
    const post: NormalizedPost = {
      id: '1', blogName: 'b', tags: [],
      content: [{ kind: 'image', media: [{ url: 'https://64.media.tumblr.com/a.gifv', declaredType: 'image/webp' }] }],
      layout: [], trail: [], unknowns: [],
    };
    const plan: MediaPlanItem[] = [
      { url: 'https://64.media.tumblr.com/a.gifv', declaredType: 'image/webp', kind: 'image', sourcePath: 'root/block[0]' },
      { url: 'https://64.media.tumblr.com/a.gifv', declaredType: 'image/webp', kind: 'image', sourcePath: 'root/block[0]dup' },
    ];
    const result = await runExportPipeline(post, plan, fetchFn);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1); // deduped
    expect(result.diagnostics.join('\n')).toMatch(/Media type corrected|image\/gif/);
    expect(result.filename).toMatch(/\.epub$/);
    const names = zipEntryNames(result.bytes!);
    expect(names.some((n) => n.endsWith('.gif'))).toBe(true);
    // post.xhtml is in OEBPS/content/, assets in OEBPS/assets/ -> src must be ../assets/...
    expect(decodeUtf8(result.bytes!)).toMatch(/src="\.\.\/assets\/[^"]+\.gif"/);
  });

  it('warns and continues when media host is not allowed or download fails', async () => {
    const post: NormalizedPost = { id: '2', blogName: 'b', tags: [], content: [{ kind: 'image', media: [{ url: 'https://evil.example/x.png' }] }], layout: [], trail: [], unknowns: [] };
    const result = await runExportPipeline(post, [{ url: 'https://evil.example/x.png', kind: 'image', sourcePath: 'x' }], async () => { throw new Error('no'); });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
