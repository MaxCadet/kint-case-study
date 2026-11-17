# Cost engineering

## Where the money actually went

Almost everything in Kint is pay-per-request: Lambda, API Gateway, DynamoDB on-demand, S3 and CloudFront. At development and beta volume, those cost cents.

One resource didn't follow that pattern. **AWS Transfer Family bills by the hour for as long as the endpoint exists**, whether or not anyone is uploading:

| Item | Rate (us-east-2) | Always-on cost |
|---|---|---|
| FTPS endpoint (one protocol) | $0.30 per hour | **~$219 per month** |
| Data in and out of the endpoint | $0.04 per GB | Small at beta volume |

In a typical month while it was running, the endpoint was **about $51 of a $52.67 bill**, roughly 97% of total spend.

## What I changed

**Delete when idle, rebuild when needed.** The endpoint exists only around shoots and is deleted afterward. A rebuild script turns setup into one command, so this is practical:

- The endpoint is created with the correct TLS settings already in place (including the session-resumption fix from [decision 1](decisions/01-camera-native-ftps.md)).
- Camera logins are provisioned by a second script.
- Every teardown is checked against the live account (the endpoint, its VPC endpoint and its network interface are all gone), not assumed from the command's output.

**Keep only the free or near-free pieces running.** These stay up between shoots because the rebuild needs them:

| Kept | Why | Idle cost |
|---|---|---|
| Elastic IP | The camera's hostname keeps pointing at the same address across rebuilds | ~$3.60 per month |
| ACM certificate, Route 53 record | Real TLS for the FTPS handshake | Free / cents |
| Identity provider stack, security group, logging role | Used directly by the rebuild | $0 at rest |

**Result:** standing cost dropped from an always-on endpoint plus usage to a few dollars a month plus hourly charges only during actual shoots. That's about a **95% reduction in monthly AWS spend**, with no feature removed.

## A lesson that cost real money

**Stopping a Transfer Family server doesn't stop billing.** It's billed from creation until deletion. A server that was stopped instead of deleted kept charging and used up the remaining credits before anyone noticed. Since then the runbook treats **delete** as the only cost-control action, and the docs state that an empty server list is the expected idle state, so nobody "fixes" it by recreating the server.

## Other cost choices

- **Serve small previews, not originals.** The gallery uses resized, cached derivatives through CloudFront, so most traffic is previews of tens to hundreds of KB, not multi-MB originals.
- **Presigned S3 downloads, with a written revisit point.** Full-resolution downloads skip CloudFront's free egress tier. That's accepted at current volume, and the egress level at which CloudFront signed URLs become worth building is written down ([decision 5](decisions/05-delivery-boundary.md)).
- **No index until it's needed.** Frame ordering is done in code instead of with a DynamoDB secondary index, which avoids index write cost on every frame ([decision 3](decisions/03-frame-ordering-and-data-model.md)).
- **No NAT gateway.** S3 traffic from the VPC goes through a free S3 gateway endpoint.
- **Staging without an FTPS endpoint.** Staging simulates camera uploads by copying files straight into its ingest bucket, which enters the pipeline at the same point a camera does: the S3 event. It never pays for an endpoint.
- **Log retention set explicitly.** Log groups that defaulted to "never expire" were set to a fixed retention period.
- **Lifecycle rules for incomplete uploads.** A camera that drops Wi-Fi mid-file can leave an incomplete multipart upload, which doesn't show up in listings but still bills. A lifecycle rule aborts them.
