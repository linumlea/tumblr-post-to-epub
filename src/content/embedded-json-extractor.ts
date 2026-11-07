import { collectPostObjects } from '../tumblr/extract';
import type { RawPostObject } from '../tumblr/types';

export interface JsonCandidateGroup {
  scriptIndex: number;
  path: string;
  posts: RawPostObject[];
}

export interface JsonDiscoveryResult {
  groups: JsonCandidateGroup[];
  diagnostics: string[];
}

function looksRelevant(text: string): boolean {
  return text.includes('PeeprRoute') || text.includes('initialTimeline') || text.includes('objectType');
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const candidates = [trimmed];
  const eq = trimmed.match(/^[^=]{0,80}=\s*([\[{].*)$/s);
  if (eq?.[1]) candidates.push(eq[1].replace(/;\s*$/, ''));
  for (const c of candidates) {
    if (!(c.startsWith('{') || c.startsWith('['))) continue;
    try {
      return JSON.parse(c);
    } catch {
      // continue
    }
  }
  return undefined;
}

export function discoverEmbeddedPostGroups(doc: Document): JsonDiscoveryResult {
  const diagnostics: string[] = [];
  const groups: JsonCandidateGroup[] = [];
  const scripts = Array.from(doc.scripts);
  diagnostics.push(`Scanned ${scripts.length} script element(s) for embedded Tumblr JSON.`);
  scripts.forEach((script, scriptIndex) => {
    const text = script.textContent ?? '';
    if (!looksRelevant(text)) return;
    const parsed = tryParseJson(text);
    if (parsed === undefined) {
      diagnostics.push(`Script ${scriptIndex} looked relevant but was not parseable JSON.`);
      return;
    }
    const found = collectPostObjects(parsed, '$', scriptIndex);
    for (const f of found) groups.push({ scriptIndex, path: f.path, posts: f.posts });
  });
  if (!groups.length) diagnostics.push('No embedded post objects were discovered.');
  return { groups, diagnostics };
}
