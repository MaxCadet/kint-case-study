# Screenshots and GIFs

Placeholders for visuals. Every image added here must use **demo data only**: no real client photos, client names, photographer names, branding or URLs.

| File (to add) | What it should show |
|---|---|
| `client-gallery-phone.png` | The client gallery on a phone, partway through a shoot |
| `live-burst.gif` | A burst of frames appearing in the gallery as they arrive |
| `photographer-dashboard.png` | The photographer's live-shoot view: frame count and the most recent frames |
| `ingest-dashboard.png` | The CloudWatch ingest dashboard (latency, error rate, failure-queue depth) with account details cropped out |
| `architecture.png` | Optional exported image of the Mermaid diagram in `docs/architecture.md` |

## Before adding a screenshot

- Use a demo gallery with neutral sample images (for example, stock or self-shot test frames with no people who could be identified).
- Crop out the browser address bar, account names, AWS account IDs, ARNs and resource names.
- Remove any logo, wordmark or tagline.
- Strip image metadata before committing (for example, `exiftool -all= file.png`).
