# Automation V2 Architecture

```text
Google Sheets curriculum DB (read-only)
          |
          +--> 05:30 SD 1-3 trigger
          +--> 06:00 SD 4-6 trigger
          +--> 06:30 Basic trigger
          +--> 07:00 Pre-Intermediate trigger
          +--> 07:30 Intermediate trigger
                     |
                     v
         persistent Production_Log claim
                     |
           P1 automatic attempt ONCE
                     |
                     v
           P2 automatic attempt ONCE
             (current P1 reference)
                     |
                     v
        server-side A4 PDF + KIP watermark
                     |
                     v
Regular Material / matching level folder
                     |
                     v
              Human final QC
         /                              APPROVE            explicit regenerate P1/P2
                              |
                       one paid call only
                              |
                       free PDF rebuild
```

## Cost guardrails

- Automatic attempts are persisted before the OpenAI request.
- Successful existing pages are skipped.
- Technical errors are persisted and are not automatically retried.
- A short `LockService` lock is held only while claiming/updating state, not during generation, so different levels may run concurrently.
- Manual double-clicks are blocked by the running claim.
- There is no Generate All button in Automation V2.
- PDF generation and QC preview do not call OpenAI.

## Retention

- P1/P2 version: 18 hours from that version's own creation time.
- Old version survives a manual regeneration until its original expiry.
- Final PDF versions: permanent Drive files.
- Hourly cleanup only trashes expired temp assets.
