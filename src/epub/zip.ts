const te = new TextEncoder();
const td = new TextDecoder();

function u16(n: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
function cat(parts: Uint8Array[]): Uint8Array { const len = parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }

// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry { name: string; data: Uint8Array; store?: boolean; }

export function buildStoredZip(entries: ZipEntry[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = te.encode(e.name.replace(/\\/g, '/'));
    const data = e.data;
    const crc = crc32(data);
    const method = 0; // store
    const flags = 0; // no UTF-8 flag necessary for ASCII paths we generate; EPUB readers fine
    const dosTime = u16(0); const dosDate = u16(0);
    const localHeader = cat([u32(0x04034b50), u16(20), u16(flags), u16(method), dosTime, dosDate, u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name]);
    local.push(localHeader, data);
    const centralHeader = cat([u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), dosTime, dosDate, u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    central.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralDir = cat(central);
  const eocd = cat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralDir.length), u32(offset), u16(0)]);
  return cat([...local, centralDir, eocd]);
}

export function textEntry(name: string, text: string): ZipEntry { return { name, data: te.encode(text) }; }
export function binEntry(name: string, data: Uint8Array): ZipEntry { return { name, data }; }
export function decodeUtf8(data: Uint8Array): string { return td.decode(data); }
