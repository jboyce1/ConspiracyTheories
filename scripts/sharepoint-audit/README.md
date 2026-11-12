# SharePoint course audit

A read-only migration audit for the Conspiracy Theories course. It visits the twelve saved lesson URLs, optionally follows other course page links, and compares media against the GitHub site's current media configuration.

## Run on Morgan's desktop

From the ConspiracyTheories folder:

```bash
./run-sharepoint-audit.sh
```

A separate Chromium window opens. Sign into Microsoft/SharePoint normally, including MFA. Once a course page is visible, the audit continues automatically. Keep that browser open until the terminal reports completion. This uses a dedicated profile, so it won't alter your usual browser session. The launcher installs the pinned dependency/browser if needed; the dependency and cached Chromium are already present on this workstation.

Reports are written to:

```text
.sharepoint-audit/latest/report.html
.sharepoint-audit/latest/inventory.json
.sharepoint-audit/latest/videos.json
```

`report.html` is a local, clickable inventory. `videos.json` lists video candidates and whether each YouTube ID is already embedded. Share the resulting local folder with Codex in this workspace for review; no credentials need to be sent.

## What it checks

- Rendered links, images, audio/video elements, and iframe sources.
- Nested frames, where browser access permits inspection.
- Encoded SharePoint web-part properties.
- SharePoint's stored `CanvasContent1` and `LayoutWebpartsContent` page fields, using the signed-in browser's existing session.
- Media request URLs, without recording request headers or cookies.
- Unloaded embed containers and inaccessible pages, reported as warnings rather than silently treated as complete.

It scrolls each page and opens explicitly labelled collapsed content. It never presses Play, edits a page, submits a form, or changes SharePoint settings.

## Useful options

```bash
# Sign in once, without running the audit:
./run-sharepoint-audit.sh --login-only

# Reuse that session for another run without displaying the browser:
./run-sharepoint-audit.sh --headless

# Also save rendered HTML and stored SharePoint properties:
./run-sharepoint-audit.sh --snapshots

# Download same-site handouts and images:
./run-sharepoint-audit.sh --download

# Also download same-site audio/video files:
./run-sharepoint-audit.sh --download --download-media

# All options:
node scripts/sharepoint-audit/audit.mjs --help
```

Downloads use authenticated SharePoint file endpoints, stay inside this course site, reject redirects, and have a 100 MB per-file limit. YouTube/Vimeo videos are inventoried as embed links; the scraper does not download those videos. A successful download is not automatically published.

## Local session and reports

The dedicated browser profile lives at `.sharepoint-audit/profile/`. The entire `.sharepoint-audit/` directory and `node_modules/` are excluded by `.gitignore`. Browser state may contain active sign-in cookies; reports and snapshots may contain private course links or content. Keep that directory local. Close the scraper browser before deleting its profile to sign out locally.

Reports strip common authentication/signature query parameters. Raw snapshots are optional and deliberately remain private. Do not add the reports or profile to the public GitHub site. The scraper does not record passwords, full network captures, request headers, or a global storage-state export.

## Interpreting results

- `already-embedded`: a YouTube ID matches `scripts/media.json`.
- `video-to-add`: a YouTube ID wasn't in the site's current video configuration.
- `local-file-found`: its filename approximately matches a file in `assets/`. This is not a content-integrity check or proof of a working published link.
- `review`: inspect the resource manually. Some URLs are background resources, duplicate representations, or non-video embeds.

Stored page fields can be unavailable because of SharePoint permissions or page type. Video providers and school policies may also block embedding. A completed run means the queue finished; warnings and page failures still need review. Exit code 2 means page errors or the page limit prevented full coverage; exit code 1 means the run stopped before completion. Reports are checkpointed after every page.

## Tests and execution limits

```bash
node scripts/sharepoint-audit/audit.test.mjs
```

The tests cover encoded embed extraction, video comparison, token removal, crawl boundaries, and safe file endpoint generation. Node.js 18+ and Playwright Core 1.56.1 are pinned to match this workstation's Chromium 141 cache. Run the launcher in a normal desktop terminal. The Codex execution sandbox currently blocks a Chromium socket operation, so a full authenticated browser audit could not be performed from that sandbox.
