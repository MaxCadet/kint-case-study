# Decision 3 — Order frames by arrival, and keep DynamoDB access patterns O(1)

## Context

The client gallery polls while a shoot is live, so ordering has to be stable: a frame the client has already seen must never jump or disappear between two polls. Ingest also looks up "which shoot is live for this photographer?" on **every frame**, which makes it the hottest read in the system.

## Decisions

### 1. Sort by arrival time, not by EXIF capture time

The gallery orders frames by **`ingestAt`**, the S3 event time. Capture time is shown, but it isn't the primary sort key.

- Capture time isn't known when the frame record is first written. Ingest writes the record as `uploading` *before* it reads the file. An index keyed on capture time would be missing exactly the frames the live view exists to show, and filling the key in later would move items between two polls.
- `ingestAt` comes from the S3 event, not the clock, so a retried frame keeps its original position.
- Many delivered exports have no EXIF at all, because editing software often strips it on export, so capture time can't be relied on in general.

**Measured finding:** during a burst test, the camera opened **two FTPS connections at once**, so a few frames arrived slightly out of shutter order. The camera's original JPEGs do include sub-second timestamps, but ingest wasn't reading them. Combining them into a millisecond-precise capture time and comparing on that when it's present fixed every inversion with no schema change.

### 2. No secondary index for ordering

Frames share one partition per shoot. The API reads the partition and sorts in code.

- An index would add write cost and storage on every frame from day one, only to provide ordering the code already gets for free.
- A secondary index can be added later with no migration, so leaving it out is a reversible omission.
- **Known cost, written down on purpose:** sorting in code can't paginate. That's fine at hundreds of frames per shoot, and the trigger to add the index is written down.

### 3. The live shoot is a pointer item

A single item, `PHOTOGRAPHER#<id> / LIVE`, holds the current live shoot. Ingest finds it with one `GetItem`.

- Querying by `status = live` would read every shoot the photographer has ever run, **on every frame**, so the cost would grow with the age of the account.
- The pointer also **is** the invariant: there can be only one live shoot, because there's only one pointer.
- The pointer and the shoot record are always updated together in a single `TransactWriteItems`, so they can never disagree.

## Consequences

Every hot-path read is a single-key lookup or a single-partition query, and ordering stays stable while frames are still arriving.
