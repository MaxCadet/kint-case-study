# Decision 2 — Make ingest idempotent with a self-expiring lease

## Context

S3 event notifications are *at least once*, and Lambda retries failed async invocations. Cameras also re-send files after a dropped connection. Ingest has to process every photo exactly once, and it must never lose a photo by mistaking it for a duplicate.

## Options considered

| Option | How it works | Problem |
|---|---|---|
| Claim, then delete the claim in a `catch` if processing fails | Write a dedup item; remove it on error | **A `catch` block doesn't run when Lambda is hard-killed.** A timeout or out-of-memory kill leaves the claim behind forever, and every retry after that is silently dropped as a duplicate. The photo is lost with no error. |
| **Lease with its expiry stored in the item** | The dedup item carries its own `claimExpiresAt`; a conditional write lets a new attempt take over an expired, unfinished claim | None that needs code to run: a dead claimant's lease simply expires |

## Decision

**A self-expiring lease, checked inside the DynamoDB condition expression.**

- The claim is a conditional `PutItem` that succeeds only if no claim exists, **or** the existing claim has expired **and** never reached `completed`.
- The lease (70 seconds) is longer than the Lambda timeout (60 seconds). A shorter lease would let a second invocation start while the first is still working.
- A **completed** claim is final for as long as it is kept, so a finished frame can't be processed twice. A TTL removes old claims after seven days.
- If another invocation holds an active lease, this invocation **throws** instead of returning, so its own retries keep going. Returning would make correctness depend on the other invocation's retries, and that invocation may already be dead.

## The dedup key

The key is a hash of bucket, object key and **version ID**, falling back to the **ETag** when there's no version. When bucket versioning is off, S3 reports the version ID as the literal string `"null"` for every object. Using it as-is would make every re-send of the same filename look like a duplicate. That's the exact case dedup exists to handle, and it would turn into lost photos.

## Consequences

- Recovery is **structural, not procedural**: nothing has to run for the system to heal.
- An **SQS failure destination is required, not optional hardening**. S3 doesn't redeliver an event, so once retries run out, the event is lost unless it's captured. A CloudWatch alarm fires on any message in that queue.
- A scheduled **sweeper** handles the one case ingest can't see in itself: a frame record left at `uploading` because the run that wrote it was killed.
