import type { NormalizedPost } from '../tumblr/types';
import { renderPostDocument } from './xhtml-renderer';
import { EPUB_CSS } from './styles';

export interface RenderedPost {
  xhtml: string;
  css: string;
  title: string;
  filenameBase: string;
  diagnostics: string[];
}

export function renderNormalizedPost(post: NormalizedPost): RenderedPost {
  const rendered = renderPostDocument(post);
  return {
    xhtml: rendered.xhtml,
    css: EPUB_CSS,
    title: rendered.title,
    filenameBase: rendered.filenameBase,
    diagnostics: rendered.diagnostics,
  };
}
