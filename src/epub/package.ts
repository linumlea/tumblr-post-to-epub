import { buildStoredZip, textEntry, binEntry, type ZipEntry } from './zip';
import { EPUB_CSS } from './styles';
import type { BinaryAsset } from '../media/index';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function mediaTypeForPath(path: string, fallback: string): string {
  const p = path.toLowerCase();
  if (p.endsWith('.xhtml') || p.endsWith('.html')) return 'application/xhtml+xml';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.mp3')) return 'audio/mpeg';
  if (p.endsWith('.m4a') || p.endsWith('.mp4a')) return 'audio/mp4';
  if (p.endsWith('.ogg')) return 'audio/ogg';
  if (p.endsWith('.wav')) return 'audio/wav';
  if (p.endsWith('.mp4')) return 'video/mp4';
  if (p.endsWith('.webm')) return 'video/webm';
  return fallback || 'application/octet-stream';
}

export interface PackageEpubOptions {
  title: string;
  filenameBase: string;
  xhtml: string;
  assets: BinaryAsset[];
  identifier?: string;
  language?: string;
  sourceUrl?: string;
}

export function packageEpub(opts: PackageEpubOptions): Uint8Array {
  const id = opts.identifier || `tumblr-epub-${Date.now()}`;
  const lang = opts.language || 'en';
  const title = opts.title || 'Tumblr post';
  const manifestItems = [
    `    <item id="post" href="content/post.xhtml" media-type="application/xhtml+xml"/>`,
    `    <item id="nav" href="content/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="css" href="styles/style.css" media-type="text/css"/>`,
    ...opts.assets.map((a, i) => `    <item id="asset-${i + 1}" href="${escXml(a.path)}" media-type="${escXml(a.mediaType || mediaTypeForPath(a.path, 'application/octet-stream'))}"/>`),
  ].join('\n');

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:schema="http://schema.org/" version="3.0" unique-identifier="bookid" xml:lang="${escXml(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escXml(id)}</dc:identifier>
    <dc:title>${escXml(title)}</dc:title>
    <dc:language>${escXml(lang)}</dc:language>
    ${opts.sourceUrl ? `<dc:source>${escXml(opts.sourceUrl)}</dc:source>` : ''}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessModeSufficient">textual</meta>
    <meta property="schema:accessibilityFeature">alternativeText</meta>
    <meta property="schema:accessibilityFeature">readingOrder</meta>
    <meta property="schema:accessibilityHazard">noFlashingHazard</meta>
    <meta property="schema:accessibilitySummary">Exported Tumblr post with semantic XHTML, headings, links, and alternative text for media where available.</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine>
    <itemref idref="post"/>
  </spine>
</package>
`;
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escXml(lang)}" lang="${escXml(lang)}">
<head><meta charset="utf-8"/><title>Navigation</title></head>
<body>
  <nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="post.xhtml">${escXml(title)}</a></li></ol></nav>
</body>
</html>
`;

  const entries: ZipEntry[] = [
    textEntry('mimetype', 'application/epub+zip'), // MUST be first and stored
    textEntry('META-INF/container.xml', container),
    textEntry('OEBPS/content.opf', opf),
    textEntry('OEBPS/content/nav.xhtml', nav),
    textEntry('OEBPS/content/post.xhtml', opts.xhtml),
    textEntry('OEBPS/styles/style.css', EPUB_CSS),
    ...opts.assets.map((a) => binEntry(`OEBPS/${a.path.replace(/^\/+/, '')}`, a.bytes)),
  ];
  return buildStoredZip(entries);
}
