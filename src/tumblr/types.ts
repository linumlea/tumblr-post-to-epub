// Initial TypeScript types for Tumblr extraction/parser/EPUB planning.
// These are intentionally permissive in raw areas and normalized in internal
// areas. The NPF spec evolves; preserve unknown data instead of discarding it.

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined }

export interface RawTumblrPageEnvelope {
  routeName?: string;
  isInitialRequestPeepr?: boolean;
  PeeprRoute?: {
    initialTimeline?: {
      objects?: RawTimelineObject[];
    };
  };
  [key: string]: JsonValue | undefined;
}

export interface RawTimelineObject {
  objectType?: string;
  [key: string]: JsonValue | undefined;
}

export interface RawPostObject extends JsonObject {
  objectType?: 'post';
  type?: string;
  originalType?: string;
  isBlocksPostFormat?: boolean;
  id?: string | number;
  idString?: string;
  blogName?: string;
  blog?: RawBlog;
  postUrl?: string;
  parentPostUrl?: string;
  canonicalUrl?: string;
  slug?: string;
  date?: string;
  timestamp?: number;
  state?: string;
  tags?: string[];
  tagsV2?: Array<{ name?: string } | string>;
  summary?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  askingName?: string;
  askingUrl?: string | null;
  content?: RawBlock[];
  layout?: RawLayoutBlock[];
  trail?: RawTrailEntry[];
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

export interface RawBlog extends JsonObject {
  name?: string;
  title?: string;
  url?: string;
  uuid?: string;
  descriptionNpf?: RawBlock[];
}

export interface RawTrailEntry extends JsonObject {
  blog?: RawBlog;
  post?: { id?: string | number; timestamp?: number; isCommercial?: boolean; [key: string]: JsonValue | undefined };
  content?: RawBlock[];
  layout?: RawLayoutBlock[];
  brokenBlogName?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface RawBlock extends JsonObject {
  type?: string;
}

export interface RawLayoutBlock extends JsonObject {
  type?: string;
  blocks?: number[];
  display?: Array<{ blocks?: number[] } | number[]>;
  truncateAfter?: number;
  attribution?: JsonObject;
}

export interface RawFormatting extends JsonObject {
  type?: string;
  start?: number;
  end?: number;
  url?: string;
  blog?: RawBlog;
  hex?: string;
}

export interface RawMedia extends JsonObject {
  url?: string;
  type?: string;
  width?: number;
  height?: number;
  poster?: RawMedia;
  cropped?: boolean;
  hasOriginalDimensions?: boolean;
  mediaKey?: string;
  colors?: Record<string, string>;
  altText?: string;
}

// Normalized internal model — parser output. Keep raw references for
// diagnostics/future support; never include sensitive session/user data.

export interface NormalizedPost {
  id: string;
  idString?: string;
  blogName?: string;
  blogTitle?: string;
  blogUrl?: string;
  url?: string;
  canonicalUrl?: string;
  slug?: string;
  timestamp?: number;
  date?: string;
  title?: string;
  summary?: string;
  tags: string[];
  sourceUrl?: string;
  sourceTitle?: string;
  askingName?: string;
  askingUrl?: string | null;
  content: NormalizedBlock[];
  trail: NormalizedTrailEntry[];
  layout: NormalizedLayout[];
  communityLabels?: JsonObject;
  isNsfw?: boolean;
  classification?: string;
  unknowns: UnknownObservation[];
  rawRef?: { source: 'root' | 'trail'; index?: number };
}

export interface NormalizedTrailEntry {
  blogName?: string;
  blogTitle?: string;
  blogUrl?: string;
  blogUuid?: string;
  postId?: string;
  timestamp?: number;
  brokenBlogName?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  content: NormalizedBlock[];
  layout: NormalizedLayout[];
  unknowns: UnknownObservation[];
}

export type NormalizedBlock =
  | TextBlock
  | ImageBlock
  | LinkBlock
  | AudioBlock
  | VideoBlock
  | PollBlock
  | PaywallBlock
  | UnknownBlock;

export interface TextBlock {
  kind: 'text';
  text: string;
  subtype?: string;
  formatting: NormalizedFormatting[];
  raw?: RawBlock;
}

export interface NormalizedFormatting {
  type: string;
  start: number;
  end: number;
  url?: string;
  blogName?: string;
  hex?: string;
  raw?: RawFormatting;
}

export interface ImageBlock {
  kind: 'image';
  media: MediaCandidate[];
  altText?: string;
  caption?: string;
  attribution?: JsonObject;
  feedbackToken?: string;
  colors?: Record<string, string>;
  raw?: RawBlock;
}

export interface MediaCandidate {
  url: string;
  declaredType?: string;
  width?: number;
  height?: number;
  poster?: MediaCandidate;
  cropped?: boolean;
  hasOriginalDimensions?: boolean;
  mediaKey?: string;
}

export interface LinkBlock {
  kind: 'link';
  url: string;
  title?: string;
  description?: string;
  author?: string;
  siteName?: string;
  displayUrl?: string;
  poster?: MediaCandidate[];
  raw?: RawBlock;
}

export interface AudioBlock {
  kind: 'audio';
  provider?: string;
  url?: string | null;
  title?: string;
  artist?: string;
  album?: string;
  media?: MediaCandidate;
  poster?: MediaCandidate[];
  embedHtmlIgnored: boolean;
  attribution?: JsonObject;
  raw?: RawBlock;
}

export interface VideoBlock {
  kind: 'video';
  provider?: string;
  url?: string | null;
  media?: MediaCandidate;
  poster?: MediaCandidate[];
  filmstrip?: MediaCandidate;
  embedHtmlIgnored: boolean;
  canAutoplayOnCellular?: boolean;
  attribution?: JsonObject;
  raw?: RawBlock;
}

export interface PollBlock {
  kind: 'poll';
  clientId?: string;
  question: string;
  answers: Array<{ clientId?: string; answerText: string }>;
  settings?: JsonObject;
  createdAt?: string;
  timestamp?: number;
  source?: string;
  raw?: RawBlock;
}

export interface PaywallBlock {
  kind: 'paywall';
  subtype?: string;
  title?: string;
  text?: string;
  raw?: RawBlock;
}

export interface UnknownBlock {
  kind: 'unknown';
  originalType: string;
  textFallback?: string;
  raw?: RawBlock;
}

export type NormalizedLayout =
  | { type: 'rows'; displays: Array<{ blocks: number[] }>; truncateAfter?: number; raw?: RawLayoutBlock }
  | { type: 'ask'; blocks: number[]; attribution?: JsonObject; raw?: RawLayoutBlock }
  | { type: 'condensed'; blocks: number[]; truncateAfter?: number; raw?: RawLayoutBlock }
  | { type: 'unknown'; originalType: string; raw?: RawLayoutBlock };

export interface UnknownObservation {
  path: string;
  type: string;
  keys?: string[];
}

export interface ExtractedPost {
  source: 'embedded-json' | 'dom-fallback';
  viewedUrl: string;
  post: NormalizedPost;
  diagnostics: string[];
}
