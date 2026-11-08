import { MessageType, type ExtensionMessage, type ExportResultPayload } from '../shared/messages';
import { runExportPipeline } from '../epub/pipeline';

async function getActiveTab(): Promise<browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function sendToActiveTab(message: ExtensionMessage): Promise<ExtensionMessage> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { type: MessageType.EXTRACTION_RESULT, payload: { ok: false, viewedUrl: '', diagnostics: ['No active tab.'], error: 'No active tab.' } } satisfies ExtensionMessage;
  }
  try {
    const response = (await browser.tabs.sendMessage(tab.id, message)) as ExtensionMessage;
    return response;
  } catch (error) {
    const detail = errorText(error);
    return {
      type: MessageType.EXTRACTION_RESULT,
      payload: {
        ok: false,
        viewedUrl: tab.url ?? '',
        diagnostics: [`Content script not available on this tab.`, `Tab: ${tab.url ?? '(no url)'}`, `sendMessage error: ${detail}`],
        error: `Content script not available: ${detail}`,
      },
    } satisfies ExtensionMessage;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function downloadEpub(filename: string, bytes: Uint8Array): Promise<void> {
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  try {
    const id = await browser.downloads.download({
      url,
      filename,
      saveAs: true,
      conflictAction: 'uniquify',
    });
    // Best-effort wait for terminal state; ignore if API shape differs.
    if (typeof id === 'number' && browser.downloads?.onChanged) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => { try { browser.downloads.onChanged.removeListener(listener); } catch {} resolve(); }, 120000);
        function listener(delta: browser.downloads._OnChangedDownloadDelta) {
          if (delta.id !== id) return;
          if (delta.state?.current === 'complete' || delta.state?.current === 'canceled' || delta.state?.current === 'interrupted' || delta.error) {
            clearTimeout(timeout);
            try { browser.downloads.onChanged.removeListener(listener); } catch {}
            resolve();
          }
        }
        try { browser.downloads.onChanged.addListener(listener); } catch { clearTimeout(timeout); resolve(); }
      });
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function progress(phase: 'extracting' | 'downloading' | 'generating' | 'saving', message: string): Promise<void> {
  try { await browser.runtime.sendMessage({ type: MessageType.EXPORT_PROGRESS, payload: { phase, message } } satisfies ExtensionMessage); } catch { /* popup may be closed */ }
}

async function handleExport(options: { embedMedia?: boolean } = {}): Promise<ExportResultPayload> {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, message: 'No active tab.', errorCode: 'UNSUPPORTED_CONTEXT' };
  const embedMedia = !!options.embedMedia;
  await progress('extracting', 'Extracting and parsing the viewed post');
  let prepared: ExtensionMessage;
  try {
    prepared = await browser.tabs.sendMessage(tab.id, { type: MessageType.PREPARE_EXPORT } satisfies ExtensionMessage) as ExtensionMessage;
  } catch (error) {
    return { ok: false, message: `Cannot reach Tumblr tab content script: ${errorText(error)}`, errorCode: 'UNSUPPORTED_CONTEXT' };
  }
  if (prepared?.type !== MessageType.EXPORT_PREPARED) return { ok: false, message: 'Unexpected export preparation response.', errorCode: 'EXTRACTION_FAILED' };
  if (!prepared.payload.ok || !prepared.payload.post) {
    return { ok: false, message: prepared.payload.error || 'Could not prepare export.', warnings: prepared.payload.diagnostics, errorCode: prepared.payload.errorCode || 'EXTRACTION_FAILED' };
  }

  const planCount = prepared.payload.mediaPlan?.length ?? 0;
  await progress('downloading', `Downloading ${planCount} media item(s)`);
  const result = await runExportPipeline(prepared.payload.post, prepared.payload.mediaPlan ?? [], fetch.bind(globalThis), { embedMedia });
  if (!result.ok || !result.bytes || !result.filename) {
    return { ok: false, message: result.error || 'Export failed.', warnings: [...prepared.payload.diagnostics, ...result.diagnostics, ...result.warnings], errorCode: result.errorCode || 'EPUB_GENERATION_FAILED' };
  }

  await progress('saving', `Saving ${result.filename}`);
  try {
    await downloadEpub(result.filename, result.bytes);
  } catch (error) {
    return {
      ok: false,
      message: `EPUB generated but download failed: ${errorText(error)}`,
      filename: result.filename,
      warnings: [...prepared.payload.diagnostics, ...result.warnings, ...result.diagnostics.slice(-8)],
      errorCode: 'DOWNLOAD_FAILED',
    };
  }

  return {
    ok: true,
    message: `Saved EPUB: ${result.filename}${result.warnings.length ? ` (${result.warnings.length} media warning(s))` : ''}`,
    filename: result.filename,
    warnings: [...prepared.payload.diagnostics, ...result.warnings],
  };
}

browser.runtime.onMessage.addListener(async (message: ExtensionMessage) => {
  if (message.type === MessageType.GET_POST_STATUS) {
    const tab = await getActiveTab();
    if (!tab?.id) return { type: MessageType.POST_STATUS, payload: { status: 'error', message: 'No active tab.' } } satisfies ExtensionMessage;
    try {
      return (await browser.tabs.sendMessage(tab.id, message)) as ExtensionMessage;
    } catch (error) {
      return {
        type: MessageType.POST_STATUS,
        payload: { status: 'unsupported', message: `Content script not available on this tab: ${errorText(error)}`, canonicalUrl: tab.url },
      } satisfies ExtensionMessage;
    }
  }

  if (message.type === MessageType.DEBUG_EXTRACT_POST || message.type === MessageType.DEBUG_LAST_EXTRACTION) {
    return await sendToActiveTab(message);
  }

  if (message.type === MessageType.EXPORT_CURRENT_POST) {
    const payload = await handleExport(message.payload ?? {});
    return { type: MessageType.EXPORT_RESULT, payload } satisfies ExtensionMessage;
  }

  return undefined;
});
