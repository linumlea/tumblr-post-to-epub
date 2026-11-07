export interface BinaryAsset {
  path: string;
  bytes: Uint8Array;
  mediaType: string;
  sourceUrl: string;
}

export interface MediaDownloadResult {
  url: string;
  ok: boolean;
  asset?: BinaryAsset;
  error?: string;
  diagnostics: string[];
  deduped?: boolean;
  actualType?: string;
  declaredType?: string;
}

export interface MediaPlanItem {
  url: string;
  declaredType?: string;
  kind: 'image' | 'audio' | 'video' | 'poster' | 'filmstrip' | 'other';
  sourcePath: string;
}

export function allowedMediaHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'tumblr.com' || host.endsWith('.tumblr.com') || host === 'tumblr.co' || host.endsWith('.tumblr.co');
}

export function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'asset';
}

export function extensionForMediaType(mediaType: string): string {
  const t = mediaType.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/octet-stream': 'bin',
  };
  return map[t] || t.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
}

export function detectMediaType(bytes: Uint8Array, headerType?: string | null): { type: string; confidence: 'signature' | 'header' | 'fallback'; note?: string } {
  const b = bytes;
  const sig = (hex: number[], offset = 0) => hex.every((v, i) => b[offset + i] === v);
  const ascii = (s: string, offset = 0) => s.split('').every((c, i) => b[offset + i] === c.charCodeAt(0));

  if (b.length >= 3 && sig([0x47, 0x49, 0x46])) return { type: 'image/gif', confidence: 'signature' };
  if (b.length >= 8 && sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: 'image/png', confidence: 'signature' };
  if (b.length >= 3 && sig([0xff, 0xd8, 0xff])) return { type: 'image/jpeg', confidence: 'signature' };
  if (b.length >= 12 && ascii('RIFF', 0) && ascii('WEBP', 8)) return { type: 'image/webp', confidence: 'signature' };
  if (b.length >= 12 && ascii('RIFF', 0) && ascii('WAVE', 8)) return { type: 'audio/wav', confidence: 'signature' };
  if (b.length >= 4 && sig([0x1a, 0x45, 0xdf, 0xa3])) return { type: 'video/webm', confidence: 'signature' };
  if (b.length >= 12 && ascii('ftyp', 4)) {
    const brand = String.fromCharCode(...Array.from(b.slice(8, 12)));
    if (/^(M4A |M4B |mp42|isom|iso2|avc1)$/i.test(brand)) return { type: brand.startsWith('M4') ? 'audio/mp4' : 'video/mp4', confidence: 'signature' };
    return { type: 'video/mp4', confidence: 'signature', note: `ftyp brand ${brand}` };
  }
  if (b.length >= 3 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return { type: 'audio/mpeg', confidence: 'signature' };
  if (b.length >= 4 && ascii('OggS', 0)) return { type: 'audio/ogg', confidence: 'signature' };

  const header = headerType?.toLowerCase().split(';')[0].trim();
  if (header && header.includes('/')) return { type: header, confidence: 'header', note: 'No known signature matched; using response header.' };
  return { type: 'application/octet-stream', confidence: 'fallback', note: 'No known signature or content-type header.' };
}
