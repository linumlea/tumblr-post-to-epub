import { MessageType, type ExtensionMessage } from '../shared/messages';

const statusEl = document.getElementById('status') as HTMLParagraphElement;
const detailEl = document.getElementById('detail') as HTMLParagraphElement;
const debugBtn = document.getElementById('debug') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const embedMediaInput = document.getElementById('embed-media') as HTMLInputElement;

async function loadSettings(): Promise<void> {
  try {
    const result = await browser.storage.local.get('embedMedia');
    embedMediaInput.checked = !!result.embedMedia;
  } catch {
    embedMediaInput.checked = false;
  }
}

async function saveSettings(): Promise<void> {
  try {
    await browser.storage.local.set({ embedMedia: embedMediaInput.checked });
  } catch {
    // Ignore storage errors in unsupported contexts; the export can still proceed with default behavior.
  }
}

function setStatus(text: string, detail = '', enabled = false): void {
  statusEl.textContent = text;
  detailEl.textContent = detail;
  debugBtn.disabled = !enabled;
  debugBtn.textContent = enabled ? 'View details' : 'Details unavailable';
  exportBtn.disabled = !enabled;
}

async function refresh(): Promise<void> {
  try {
    const response = (await browser.runtime.sendMessage({ type: MessageType.GET_POST_STATUS } satisfies ExtensionMessage)) as ExtensionMessage | undefined;
    if (!response || response.type !== MessageType.POST_STATUS) {
      setStatus('Unknown status', 'No response from extension.');
      return;
    }
    const { status, message, postId, blogName, canonicalUrl } = response.payload;
    const details = [blogName ? `Blog: ${blogName}` : '', postId ? `Post: ${postId}` : '', canonicalUrl ? `URL: ${canonicalUrl}` : '']
      .filter(Boolean)
      .join('\n');
    // Allow debug on Tumblr pages even when status is unsupported/searching so failures are visible.
    setStatus(message, details, status === 'ready' || status === 'searching' || status === 'unsupported');
  } catch (error) {
    setStatus('Error checking page', error instanceof Error ? error.message : String(error));
  }
}

browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === MessageType.EXPORT_PROGRESS) {
    statusEl.textContent = message.payload.message;
    detailEl.textContent = message.payload.phase ? `Phase: ${message.payload.phase}` : '';
  }
});

debugBtn.addEventListener('click', async () => {
  setStatus('Extracting post…', 'Running embedded JSON discovery and post matching.', false);
  try {
    const response = (await browser.runtime.sendMessage({ type: MessageType.DEBUG_EXTRACT_POST } satisfies ExtensionMessage)) as ExtensionMessage | undefined;
    if (response?.type !== MessageType.EXTRACTION_RESULT) {
      setStatus('Extraction failed', 'Unexpected response.', true);
      return;
    }
    const p = response.payload;
    const summary = [
      p.ok ? `Source: ${p.source ?? 'unknown'}` : `Error: ${p.error ?? 'unknown'}`,
      p.postId ? `Post: ${p.postId}` : '',
      p.blogName ? `Blog: ${p.blogName}` : '',
      p.bodyLocation ? `Body: ${p.bodyLocation}` : '',
      p.normalized ? `Trail: ${p.normalized.trailCount}, Unknowns: ${p.normalized.unknownCount}` : '',
      `Candidates: ${p.candidatesCount ?? 0}`,
      ...(p.diagnostics ?? []).slice(0, 8),
      (p.diagnostics?.length ?? 0) > 8 ? `(+${(p.diagnostics?.length ?? 0) - 8} more diagnostics)` : '',
    ].filter(Boolean).join('\n');
    setStatus(p.ok ? 'Extraction/parse complete' : 'Extraction fallback/error', summary, true);
  } catch (error) {
    setStatus('Extraction failed', error instanceof Error ? error.message : String(error), true);
  }
});

exportBtn.addEventListener('click', async () => {
  setStatus('Exporting…', 'Extracting, downloading media, and packaging EPUB.', false);
  try {
  await saveSettings();
  const response = (await browser.runtime.sendMessage({
    type: MessageType.EXPORT_CURRENT_POST,
    payload: { embedMedia: embedMediaInput.checked },
  } satisfies ExtensionMessage)) as ExtensionMessage | undefined;
  if (response?.type === MessageType.EXPORT_RESULT) {
    const p = response.payload;
    const lines = [p.message];
    if (p.filename) lines.push(`File: ${p.filename}`);
    if (p.errorCode) lines.push(`Code: ${p.errorCode}`);
    if (p.warnings?.length) {
      lines.push('', `Warnings (${p.warnings.length}):`);
      lines.push(...p.warnings.slice(0, 8));
      if (p.warnings.length > 8) lines.push(`(+${p.warnings.length - 8} more)`);
    }
    setStatus(p.ok ? 'Export complete' : 'Export failed', lines.join('\n'), true);
  } else {
    setStatus('Export failed', 'Unexpected response from background.', true);
  }
} catch (error) {
  setStatus('Export failed', error instanceof Error ? error.message : String(error), true);
}
});

embedMediaInput.addEventListener('change', () => {
void saveSettings();
});

void loadSettings();
void refresh();
