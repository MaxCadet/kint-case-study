# Code excerpts

Sanitized, trimmed excerpts from the production code. They're meant to be read, not deployed: placeholders replace account-specific values, and authentication and IAM internals are omitted.

| File | What it shows |
|---|---|
| [`ci-deploy-oidc.yml`](ci-deploy-oidc.yml) | Reusable GitHub Actions deploy with keyless OIDC, per-environment roles, an actor allowlist checked before any credential is requested, and a containerized arm64 build |
| [`ingest-derivatives.mjs`](ingest-derivatives.mjs) | The image derivative pipeline: resize once, encode twice, sharpening and chroma settings, versioned keys, and truncated-JPEG detection |
| [`template-ingest.yaml`](template-ingest.yaml) | AWS SAM: the ingest Lambda (arm64), bounded async retries, an SQS failure destination, and a CloudWatch alarm on the failure queue |
| [`derivatives.test.mjs`](derivatives.test.mjs) | Tests that check the encoded bytes (sharpness, chroma, key layout, truncation), not just the options passed |

The test file imports from `ingest-derivatives.mjs`, so with `sharp` installed, `node --test` runs them together.
