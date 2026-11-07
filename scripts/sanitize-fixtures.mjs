import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const rawDir = path.join(root, 'post-examples');
const outDir = path.join(root, 'tumblr-epub-extension', 'tests', 'fixtures', 'raw');

const selections = [
  { source: 'post.json', out: 'text-formatting-long-reblog-trail.json', note: 'Long formatted text, headings, many images/GIF-like media, mention formatting; content in trail.' },
  { source: 'post3.json', out: 'chat-root-content.json', note: 'Root content with chat/heading blocks and formatting; empty trail.' },
  { source: 'post6.json', out: 'image-rows-gifv-colors.json', note: 'Image blocks with rows layout, gifv URLs declared as webp, posters/colors, small/bold/italic formatting.' },
  { source: 'post10.json', out: 'ask-layout.json', note: 'Ask/note-style layout referencing blocks; trail content with image.' },
  { source: 'post14.json', out: 'audio-rows.json', note: 'Audio block with media/poster/embedHtml field and rows layout; text in trail.' },
  { source: 'post17.json', out: 'multi-trail-video-link.json', note: 'Multiple trail entries, video with poster/filmstrip, inline link formatting.' },
  { source: 'post21.json', out: 'poll.json', note: 'Poll block with answers/settings/timestamps plus text blocks.' },
  { source: 'post22.json', out: 'condensed-truncate-color-links.json', note: 'Rows/condensed layouts with truncateAfter, overlapping color+bold inline ranges, and ordered-list items containing links; content in trail.' },
  { source: 'post23.json', out: 'link-block-root-content.json', note: 'Root content link block with url/displayUrl/title/description/siteName/poster; plus inline link formatting; empty trail.' },
  { source: 'post24.json', out: 'inline-formatting-subtypes-private.json', note: 'Private post, root content; strikethrough/bold/italic/small/link/color formatting and heading/quote/chat/quirky/indented/ordered+unordered list subtypes.' },
];

function sanitizePost(post) {
  if (!post || typeof post !== 'object') return post;
  const keep = {
    objectType: post.objectType,
    type: post.type,
    originalType: post.originalType,
    isBlocksPostFormat: post.isBlocksPostFormat,
    id: post.id,
    idString: post.idString,
    blogName: post.blogName,
    postUrl: post.postUrl,
    parentPostUrl: post.parentPostUrl,
    canonicalUrl: post.canonicalUrl,
    slug: post.slug,
    date: post.date,
    timestamp: post.timestamp,
    state: post.state,
    tags: post.tags,
    tagsV2: post.tagsV2,
    summary: post.summary,
    sourceUrl: post.sourceUrl,
    sourceTitle: post.sourceTitle,
    askingName: post.askingName,
    askingUrl: post.askingUrl,
    content: post.content,
    layout: post.layout,
    trail: post.trail,
    rebloggedFromId: post.rebloggedFromId,
    rebloggedFromUrl: post.rebloggedFromUrl,
    rebloggedFromName: post.rebloggedFromName,
    rebloggedFromUuid: post.rebloggedFromUuid,
    rebloggedRootId: post.rebloggedRootId,
    rebloggedRootUrl: post.rebloggedRootUrl,
    rebloggedRootName: post.rebloggedRootName,
    rebloggedRootUuid: post.rebloggedRootUuid,
    communityLabels: post.communityLabels,
    isNsfw: post.isNsfw,
    classification: post.classification,
    blog: post.blog ? {
      name: post.blog.name,
      title: post.blog.title,
      url: post.blog.url,
      uuid: post.blog.uuid,
      descriptionNpf: post.blog.descriptionNpf,
    } : undefined,
  };
  return JSON.parse(JSON.stringify(keep));
}

function sanitizeEnvelope(raw, sourceName) {
  const posts = raw?.PeeprRoute?.initialTimeline?.objects?.filter((o) => o?.objectType === 'post') ?? [];
  return {
    fixtureVersion: 1,
    sourceCapture: sourceName,
    sanitized: true,
    privacy: 'Removed React Query/user/session/placement/ad/community membership data from raw capture.',
    routeName: raw?.routeName,
    posts: posts.map(sanitizePost),
  };
}

await mkdir(outDir, { recursive: true });
const catalog = [];
for (const sel of selections) {
  const raw = JSON.parse(await readFile(path.join(rawDir, sel.source), 'utf8'));
  const fixture = sanitizeEnvelope(raw, sel.source);
  await writeFile(path.join(outDir, sel.out), JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  catalog.push({ ...sel, postCount: fixture.posts.length, postIds: fixture.posts.map((p) => p.idString || p.id) });
}

const unknown = {
  fixtureVersion: 1,
  sourceCapture: 'hand-crafted',
  sanitized: true,
  privacy: 'Synthetic fixture; no private data.',
  routeName: 'synthetic',
  posts: [{
    objectType: 'post',
    type: 'blocks',
    originalType: 'regular',
    id: 'synthetic-unknown-1',
    idString: 'synthetic-unknown-1',
    blogName: 'fixture-blog',
    postUrl: 'https://fixture-blog.tumblr.com/post/synthetic-unknown-1',
    canonicalUrl: 'https://www.tumblr.com/fixture-blog/synthetic-unknown-1',
    slug: 'synthetic-unknown',
    date: '2026-01-01 00:00:00 GMT',
    timestamp: 1767225600,
    state: 'published',
    tags: ['fixture'],
    summary: 'Unknown block fallback fixture',
    content: [
      { type: 'text', text: 'Known text before unknown block.' },
      { type: 'mystery_block_2099', foo: 'bar', nested: { url: 'https://example.com' } },
      { type: 'text', text: 'Known text after unknown block.' }
    ],
    layout: [],
    trail: [],
    blog: { name: 'fixture-blog', title: 'Fixture Blog', url: 'https://fixture-blog.tumblr.com/', uuid: 't:fixture' }
  }]
};
await writeFile(path.join(outDir, 'unknown-future-block.json'), JSON.stringify(unknown, null, 2) + '\n', 'utf8');
catalog.push({ source: 'hand-crafted', out: 'unknown-future-block.json', note: 'Undocumented block type to lock fallback behavior.', postCount: 1, postIds: ['synthetic-unknown-1'] });

await writeFile(path.join(outDir, 'CATALOG.json'), JSON.stringify({ generatedAt: new Date().toISOString(), fixtures: catalog }, null, 2) + '\n', 'utf8');
console.log(`Wrote ${catalog.length} fixtures to ${outDir}`);
