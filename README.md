# KIP Material Production Center — Automation V2

This build implements the locked production flow for Regular Material.

## Locked daily flow (Asia/Jakarta / WIB)

- 05:30 — SD 1-3
- 06:00 — SD 4-6
- 06:30 — SMP/SMA/UMUM Basic
- 07:00 — SMP/SMA/UMUM Pre-Intermediate
- 07:30 — SMP/SMA/UMUM Intermediate

Each level trigger runs independently. The backend uses persistent state + a short Apps Script lock to claim a page before the OpenAI request. A second execution cannot create the same automatic page request again.

Normal flow: Page 1 once → Page 2 once using Page 1 → 2-page A4 PDF → Google Drive → human visual QC.

There are **zero automatic retries**. If OpenAI technically fails and returns no image, that material stops at the failed step. Human must explicitly click Retry/Regenerate.

A bad-looking image is still sent to PDF. Quality never causes an automatic second OpenAI call.

## Image model

- `gpt-image-2`
- `1024x1536`
- `medium`
- PNG
- exact Sheet prompt; no prompt rewriting

Page 1 uses the exact Page 1 Prompt + official KIP logo reference. Page 2 uses the exact Page 2 Prompt + current Page 1 + official KIP logo reference.

## Temporary source retention

Every generated P1/P2 version is kept for **18 hours from its own creation timestamp**. Manual regeneration creates a new version and does not dispose of the old version early. `cleanupExpiredTempAssets` runs hourly and trashes only expired temporary assets.

Final PDFs do not expire automatically.

## Google Drive structure

The installer creates/reuses:

```
Regular Material/
├── SD 1-3/
├── SD 4-6/
├── SMP-SMA-UMUM Basic/
├── SMP-SMA-UMUM Pre-Intermediate/
└── SMP-SMA-UMUM Intermediate/
```

PDFs are versioned and permanently stored in the appropriate level folder. Current PDF links appear in `Production_Log`; every file event is also written to `Generation_Log` with a clickable Drive link.

## Spreadsheet requirements

Existing curriculum sheets remain read-only and must keep these exact headers:

`Date | Level | Week | Meeting | Theme | Topic | Page 1 Prompt | Page 2 Prompt | Status | Material ID | Notes`

Automation V2 adds two log sheets automatically:

- `Production_Log` — current state / idempotency / QC / current Drive links
- `Generation_Log` — append-only file/version/error audit with clickable links

If you already have old sheets with these names and different headers, rename them before installation.

## Script Properties

Required:

```
OPENAI_API_KEY
ADMIN_EMAIL
ADMIN_PASSWORD
SESSION_SECRET
```

Optional:

```
SPREADSHEET_ID   # only for standalone Apps Script
SESSION_HOURS    # default 12
```

`installKipAutomationV2()` stores the bound Spreadsheet ID for reliable time-driven triggers, sets the GPT Image 2 / medium properties, and creates Drive IDs automatically.

## One-time installation

1. Open the curriculum Spreadsheet → Extensions → Apps Script.
2. Replace `Code.gs` with `gas/Code.gs` from this package.
3. Replace the manifest with `gas/appsscript.json` if needed. The project timezone must be `Asia/Jakarta`.
4. Add the required Script Properties.
5. Run `installKipAutomationV2()` once and authorize Drive, Docs, Sheets, UrlFetch, and trigger permissions.
6. Confirm `Production_Log`, `Generation_Log`, the `Regular Material` Drive folder structure, and six installed triggers (five level triggers + hourly cleanup).
7. Deploy / redeploy Apps Script as a Web App, execute as you, accessible to the frontend as appropriate for your setup.
8. Upload `index.html`, `app.js`, `styles.css`, `utilities.html`, and `assets/` to GitHub Pages.
9. Open the site, store the GAS `/exec` URL once, then sign in.

## Human QC

The dashboard shows the final PDF plus current P1/P2 source versions and expiry countdowns. Viewing is free.

`Regenerate Page 1` and `Regenerate Page 2` each require an explicit confirmation and create exactly one paid OpenAI image request. The other page is never regenerated automatically. When both source pages are still available, the PDF is rebuilt automatically for free.

If Page 1 is regenerated after Page 2, Page 2 remains untouched and a continuity warning appears.

## Important trigger timing note

Apps Script clock triggers use approximate scheduling around the requested minute. The 30-minute staggering plus per-page idempotency protects the system if windows overlap.


## Utilities shortcuts
The production header now includes direct shortcuts to **PDF Converter** and **White Background**. The White Background utility processes material images locally in the browser and pushes light/off-white/cream page backgrounds toward pure white while preserving darker text, borders, logos, and illustrations. No OpenAI request is used for this utility.
