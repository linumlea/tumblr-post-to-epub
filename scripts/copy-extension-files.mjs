import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

await mkdir(path.join(dist, 'icons'), { recursive: true });
await copyFile(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
await copyFile(path.join(root, 'public', 'icons', 'icon.svg'), path.join(dist, 'icons', 'icon.svg'));
console.log('Copied extension manifest and icons to dist/.');
