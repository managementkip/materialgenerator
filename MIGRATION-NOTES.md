# Migration Notes from the Manual-QC Build

1. The old browser session is no longer the source of truth. Generation state is persisted in `Production_Log`.
2. `Generate All Page 1` / `Generate All Page 2` are intentionally removed.
3. Page 2 no longer waits for Page 1 human approval during the automatic morning pipeline.
4. QC now happens after the server-created PDF.
5. Browser logout does not delete temporary images. Their lifetime is fixed at 18 hours per version.
6. PDF assembly moved from browser-only `pdf-lib` into Apps Script so scheduled runs can finish without an open computer.
7. Final PDFs are saved to Google Drive under `Regular Material/<level>/`.
8. Manual regeneration is page-specific and explicitly paid; it never regenerates the other page.
