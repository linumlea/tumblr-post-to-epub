import type { NormalizedPost } from '../tumblr/types';
import type { MediaPlanItem } from '../media/index';

// Message protocol between popup, content script, and background.
// Keep browser-independent types here where possible; runtime message passing is
// browser-specific and implemented in extension contexts only.

export const MessageType = {
  GET_POST_STATUS: 'GET_POST_STATUS',
  POST_STATUS: 'POST_STATUS',
  EXPORT_CURRENT_POST: 'EXPORT_CURRENT_POST',
  EXPORT_PROGRESS: 'EXPORT_PROGRESS',
  EXPORT_RESULT: 'EXPORT_RESULT',
  DEBUG_EXTRACT_POST: 'DEBUG_EXTRACT_POST',
  EXTRACTION_RESULT: 'EXTRACTION_RESULT',
  DEBUG_LAST_EXTRACTION: 'DEBUG_LAST_EXTRACTION',
  PREPARE_EXPORT: 'PREPARE_EXPORT',
  EXPORT_PREPARED: 'EXPORT_PREPARED',
} as const;

// Also attach to globalThis for defensive cross-context access in extension scripts.
try {
  (globalThis as { __TUMBLR_EPUB_MESSAGE_TYPE__?: typeof MessageType }).__TUMBLR_EPUB_MESSAGE_TYPE__ = MessageType;
} catch {
  // ignore
}

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export type PostDetectionStatus =
  | 'not-tumblr'
  | 'searching'
  | 'ready'
  | 'unsupported'
  | 'error';

export interface PostStatusPayload {
  status: PostDetectionStatus;
  message: string;
  postId?: string;
  blogName?: string;
  canonicalUrl?: string;
}

export interface ExtractionResultPayload {
  ok: boolean;
  source?: 'embedded-json' | 'dom-fallback';
  viewedUrl: string;
  postId?: string;
  blogName?: string;
  canonicalUrl?: string;
  bodyLocation?: 'root' | 'trail' | 'root+trail' | 'none';
  candidatesCount?: number;
  diagnostics: string[];
  error?: string;
  post?: unknown;
  normalized?: {
    id: string;
    blogName?: string;
    tags: string[];
    contentKinds: string[];
    trailCount: number;
    trail: Array<{ blogName?: string; contentKinds: string[]; layoutTypes: string[] }>;
    layoutTypes: string[];
    unknownCount: number;
  };
}

export interface ExportProgressPayload {
  phase: 'extracting' | 'downloading' | 'generating' | 'saving';
  message: string;
}

export interface ExportResultPayload {
  ok: boolean;
  message: string;
  filename?: string;
  warnings?: string[];
  errorCode?: string;
}

export interface ExportPreparedPayload {
  ok: boolean;
  viewedUrl: string;
  post?: NormalizedPost;
  mediaPlan?: MediaPlanItem[];
  diagnostics: string[];
  error?: string;
  errorCode?: string;
}

export type ExtensionMessage =
  | { type: typeof MessageType.GET_POST_STATUS }
  | { type: typeof MessageType.POST_STATUS; payload: PostStatusPayload }
  | { type: typeof MessageType.EXPORT_CURRENT_POST }
  | { type: typeof MessageType.EXPORT_PROGRESS; payload: ExportProgressPayload }
  | { type: typeof MessageType.EXPORT_RESULT; payload: ExportResultPayload }
  | { type: typeof MessageType.DEBUG_EXTRACT_POST }
  | { type: typeof MessageType.EXTRACTION_RESULT; payload: ExtractionResultPayload }
  | { type: typeof MessageType.DEBUG_LAST_EXTRACTION; payload?: unknown }
  | { type: typeof MessageType.PREPARE_EXPORT }
  | { type: typeof MessageType.EXPORT_PREPARED; payload: ExportPreparedPayload };
