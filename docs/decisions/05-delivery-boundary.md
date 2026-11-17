# Decision 5 — Keep originals out of the CDN; serve downloads with short-lived presigned URLs

## Context

Clients browse the gallery through CloudFront. Full-resolution originals must reach a client only when the photographer allows it, and never through a path that can be cached or shared indefinitely.

## Decision

- **Two derivative prefixes, one security boundary.** Ingest writes a **clean** set and a **watermarked** set to separate prefixes. The bucket policy lets CloudFront read **only** the watermarked prefix. Originals and the clean set can't be reached through the CDN at all.
- **Per-photo downloads use S3 presigned URLs** with a **five-minute** expiry, issued by the API only after it checks the gallery's rules for that photo.

## Options considered for downloads

| Option | Pros | Cons |
|---|---|---|
| **S3 presigned URLs (chosen)** | No new infrastructure: one SDK call and a narrow read grant; leaves the CDN boundary untouched | Downloads bypass CloudFront's free egress tier; the storage hostname is visible in the link |
| CloudFront signed URLs | Better on both of those points | Needs a signing key pair, a trusted key group and a CDN path to the originals, which would widen a boundary drawn on purpose |

## Consequences

- A presigned URL works for anyone who has it, so the **short expiry is the control after it's issued**: a leaked link stops working within five minutes.
- **Written revisit trigger:** if download egress grows past a set monthly volume, or the storage-hostname exposure becomes a problem, move originals behind CloudFront signed URLs. That's the point where the extra infrastructure pays for itself.
- Previews, which are most of the traffic, already go through CloudFront's cache and free tier.
