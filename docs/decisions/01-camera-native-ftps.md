# Decision 1 — Use the camera's own FTPS client, and keep RAW off the live path

## Context

The product promise is *shot → safe → seen*, during the event. Getting files off the camera was the first problem to solve, and it had to work with no laptop on location.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **A. Camera's built-in FTPS client → AWS Transfer Family** | Nothing to install or run on location; most professional bodies support it; each file is pushed as soon as it's written | FTPS on Transfer Family needs a custom identity provider and a VPC-hosted endpoint; the endpoint bills by the hour while it exists |
| B. "Hot folder" watcher script on a laptop | Works with any camera | A laptop has to be on location and running; one more thing to fail mid-event |
| C. RAW files on the live path, converted server-side | The archive would be complete | 25–45 MB per frame vs. 5–10 MB for a JPEG; can't keep up over venue Wi-Fi; browsers can't display RAW anyway |

## Decision

**Option A, JPEG only.** The camera writes RAW to one card for later editing and sends JPEGs over FTPS from the other card, which is already a standard setup for working photographers. The live path carries only what a gallery can show.

## Implementation notes

- A **VPC-hosted** Transfer Family endpoint, so a static **Elastic IP** stays attached across rebuilds. The hostname a photographer types into the camera never changes.
- A **custom identity provider** (API Gateway + Lambda), because the built-in user store doesn't support FTPS.
- An **S3 gateway VPC endpoint** instead of a NAT gateway for S3 traffic.
- **No load balancer in front of the endpoint**, because AWS documents that one caps simultaneous connections and hides real client IPs in the logs.

## Consequences

- The client gallery gets every frame within seconds, with no extra steps for the photographer.
- The endpoint is the most expensive resource in the system, which led to [the cost decision](../cost-engineering.md).
- Camera-side setup turned out to be where most of the friction is: network settings, FTPS mode, auto-transfer toggles. Server-side behavior was confirmed separately with a command-line FTPS client, which made it easy to tell camera problems from pipeline problems.

## Gotcha worth remembering

The endpoint was first configured to **require TLS session resumption**. Many FTPS clients don't resume the data-channel TLS session from the control channel correctly, so uploads disconnected with **no FTP error at all**. Turning the setting off fixed it, and I added it to the rebuild script so a fresh endpoint can't bring the bug back.
