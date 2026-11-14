# Tumblr Post to EPUB

Firefox add-on that exports an individual Tumblr post as a self-contained EPUB 3 file for personal archiving. It reads the post currently open in your Tumblr session, extracts the content and available metadata, downloads Tumblr-hosted media required for the book, and saves a single `.epub` file.

**[Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tumblr-post-to-epub/)**

## Features

- Export the currently viewed Tumblr post from the extension popup.
- Extract post data from Tumblr page metadata with a DOM fallback when structured data is unavailable.
- Preserve post body text, tags, source links, and reblog trail entries where available.
- Render readable XHTML/CSS in the EPUB without injecting Tumblr scripts or embeds.
- Download referenced media from Tumblr and package it into the EPUB when allowed.
- Warn when some media cannot be downloaded or preserved.

## Limitations

- Works best on Tumblr post pages in Firefox; behavior may vary across Tumblr page layouts or SPA states.
- Some posts or media may be unavailable because of removed content, access restrictions, or changes in the page structure.
- Embedded third-party players and scripts are not included; audio and video blocks are represented as metadata/fallback content.
- Export quality is best-effort and depends on the data Tumblr exposes on the active page.
- This is an unofficial tool and is not affiliated with Tumblr.

## Install in Firefox

### Prerequisites

- [Firefox](https://www.mozilla.org/firefox/)
- [Node.js](https://nodejs.org/) (LTS recommended) and npm

### Build the add-on

```powershell
cd path\to\tumblr-post-to-epub
npm install
npm run typecheck
npm test
npm run build
```

The build output is created in `dist/` and includes the manifest and icons required for Firefox loading.

### Load the extension

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `dist/manifest.json`.
4. Open a Tumblr post permalink, then refresh the tab after loading or reloading the add-on.
5. Click the extension icon and choose **Export as EPUB**.

## Usage notes

- The popup shows whether the active tab appears to contain a single Tumblr post.
- **Embed audio/video in EPUB** is optional. When enabled, direct media files are embedded in the EPUB when possible; otherwise the export keeps the safer metadata/link fallback.
- **Export as EPUB** downloads a `.epub` file. Review warnings in the popup if some media could not be packaged.
- Content scripts run on live `*.tumblr.com` pages; saved `file://` pages and view-source pages are not supported.

## Privacy, security, and telemetry

This extension is intended for personal archiving. It does not send your Tumblr login session, account data, browsing data, or extracted post metadata to a third-party service.

- The extension only operates on the Tumblr post currently open in the browser and reads the page content needed to export that post.
- It downloads media from Tumblr-hosted URLs required to package the EPUB. This is the same network access Tumblr already performs to serve the page/media you are viewing.
- The extension does not collect telemetry, analytics, crash reports, or usage counters. It does not transmit the list of posts you export or the content of those posts to a remote server.
- It does not store Tumblr login tokens or credentials. No authentication data is saved by the add-on itself.
- Tumblr-provided HTML or scripts are not injected into the add-on UI or generated EPUB document.
- Sanitized fixtures in `tests/fixtures/` exclude sensitive user, session, account, or ad data.

In other words: if you open a Tumblr post in Firefox and use the extension to export it, the page and media are already being fetched by Tumblr and the browser; the add-on does not add a separate remote data collection layer beyond the normal Tumblr page/media requests it needs for the local archive export.

## Permissions

- `*://*.tumblr.com/*`, `*://*.tumblr.co/*` — read the active page and download Tumblr-hosted media before packaging the EPUB.
- `activeTab`, `scripting` — run export actions on the active tab only when requested.
- `downloads` — save the generated EPUB file to the user's computer.

## Support and development

Report issues or ask for help in the project repository: https://github.com/linumlea/tumblr-post-to-epub/issues

For contributors, the usual checks are:

```powershell
npm run test
npm run typecheck
npm run build
npm run lint:ext
```

## License

MIT. See [LICENSE](LICENSE).
