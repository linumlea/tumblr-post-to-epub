import type { JsonObject, NormalizedPost, RawPostObject } from './types';

export type ExtractionSource = 'embedded-json' | 'dom-fallback';

export interface PostMatchInput {
  viewedUrl: string;
  postIdHint?: string;
  blogNameHint?: string;
  slugHint?: string;
}

export interface CandidatePostSummary {
  index: number;
  id?: string;
  idString?: string;
  blogName?: string;
  postUrl?: string;
  canonicalUrl?: string;
  slug?: string;
}

export interface PostMatchResult {
  matched: RawPostObject;
  confidence: 'high' | 'medium';
  reason: string;
  candidates: CandidatePostSummary[];
  diagnostics: string[];
}

export type BodyLocation = 'root' | 'trail' | 'root+trail' | 'none';

export interface SanitizedTrailEntry {
  blog?: JsonObject;
  post?: JsonObject;
  content?: JsonObject[];
  layout?: JsonObject[];
  brokenBlogName?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface SanitizedPost {
  objectType?: string;
  type?: string;
  originalType?: string;
  isBlocksPostFormat?: boolean;
  id?: string | number;
  idString?: string;
  blogName?: string;
  blog?: JsonObject;
  postUrl?: string;
  parentPostUrl?: string;
  canonicalUrl?: string;
  slug?: string;
  date?: string;
  timestamp?: number;
  state?: string;
  tags?: string[];
  tagsV2?: unknown[];
  summary?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  askingName?: string;
  askingUrl?: string | null;
  content?: JsonObject[];
  layout?: JsonObject[];
  trail?: SanitizedTrailEntry[];
  rebloggedFromId?: string;
  rebloggedFromUrl?: string;
  rebloggedFromName?: string;
  rebloggedFromUuid?: string;
  rebloggedRootId?: string;
  rebloggedRootUrl?: string;
  rebloggedRootName?: string;
  rebloggedRootUuid?: string;
  communityLabels?: JsonObject;
  isNsfw?: boolean;
  classification?: string;
}

export interface ExtractionResult {
  ok: boolean;
  source?: ExtractionSource;
  viewedUrl: string;
  post?: SanitizedPost;
  normalizedPost?: NormalizedPost;
  bodyLocation?: BodyLocation;
  candidatesCount?: number;
  diagnostics: string[];
  error?: string;
}

export interface DiscoveryCandidate {
  path: string;
  scriptIndex: number;
  posts: RawPostObject[];
}
