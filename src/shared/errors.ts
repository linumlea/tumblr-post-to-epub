export class TumblrEpubError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'TumblrEpubError';
    this.code = code;
    this.details = details;
  }
}

export const ErrorCode = {
  NOT_TUMBLR: 'NOT_TUMBLR',
  POST_NOT_FOUND: 'POST_NOT_FOUND',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  MEDIA_DOWNLOAD_FAILED: 'MEDIA_DOWNLOAD_FAILED',
  EPUB_GENERATION_FAILED: 'EPUB_GENERATION_FAILED',
  UNSUPPORTED_CONTEXT: 'UNSUPPORTED_CONTEXT'
} as const;
