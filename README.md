# Tumblr Post to EPUB (Firefox)

Firefox WebExtension that exports an individual Tumblr post as a self-contained EPUB 3 file for personal archiving. It uses the Tumblr page you already have open in your logged-in session and packages the extracted post content and referenced media into a downloadable `.epub`.

## Features

- Export the currently viewed Tumblr post from the extension popup.
- Extract Tumblr post data from the page (with a limited DOM fallback when structured data is unavailable).
- Preserve post body content, tags, source metadata where available, and reblog trail entries/attribution.
- Render readable XHTML/CSS inside the EPUB (no Tumblr embed HTML/scripts injected).
- Download referenced Tumblr-hosted media and package it into the EPUB; media type is detected from file bytes where possible.
- Show export warnings when some media cannot be downloaded.

## Limitations

- Works on Tumblr post pages in Firefox; behavior may vary across Tumblr page layouts/SPA states.
- Some posts or media may be unavailable due to permissions, removed content, or page/media host restrictions. The exporter does not bypass access controls.
- Embedded third-party players/scripts are not included in the EPUB; audio/video blocks are exported as metadata/fallback content.
- Fidelity is best-effort and depends on the data Tumblr exposes on the page.
- This is an unofficial tool and not affiliated with Tumblr.

## Local installation (temporary in Firefox)

### Prerequisites

- [Firefox](https://www.mozilla.org/firefox/)
- [Node.js](https://nodejs.org/) (LTS recommended) and npm

### Build

```powershell
cd path\to\tumblr-post-to-epub
npm install
npm run typecheck
npm test
npm run build
```

`npm run build` compiles the extension into `dist/` and copies `manifest.json` and icons there, so Firefox can load it from `dist/`.

If `npm install` reports install scripts that need approval in your environment (for example `esbuild`), run:

```powershell
npm approve-scripts --allow-scripts-pending
npm install
```

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select **`dist/manifest.json`** (not the root `manifest.json`).
4. Open a Tumblr post permalink, then refresh the tab after loading/reloading the add-on.
5. Click the extension icon and choose **Export as EPUB**.

To pick up code changes: rebuild/copy, reload the temporary add-on in `about:debugging`, then refresh the Tumblr tab.

## Usage notes

- **Debug extract** shows extraction/parsing diagnostics for the current page.
- **Export as EPUB** downloads an `.epub` file. Review any warnings shown in the popup.
- Content scripts run on live `*.tumblr.com` pages; saved `file://` pages and view-source pages are not supported.

## Privacy and security

- Uses your existing Tumblr login session for page/media access; it does not ask for Tumblr credentials or store auth tokens.
- No telemetry, no external server, and no post-content upload by this extension.
- Tumblr-provided HTML/embed scripts are not injected into extension UI or generated XHTML.
- Sanitized test fixtures in `tests/fixtures/` exclude sensitive session/user/account/ad data.

## Permissions

- `*://*.tumblr.com/*`, `*://*.tumblr.co/*` — read the viewed Tumblr page and download Tumblr-hosted media for packaging.
- `activeTab`, `scripting` — run extraction/export actions on the active tab when requested.
- `downloads` — save the generated EPUB.
- `storage` — reserved for small local settings (not used for post content/credentials).

## Development

```powershell
npm run test
npm run test:watch
npm run typecheck
npm run build
npm run lint:ext
```

`npm run lint:ext`, `npm run start:firefox`, and `npm run package:ext` use `web-ext` against `dist/`.

## License

MIT. See [LICENSE](LICENSE).
