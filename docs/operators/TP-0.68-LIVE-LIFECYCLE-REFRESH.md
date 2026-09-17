# Operator Guide — TP-0.68 Live Lifecycle Refresh

The Candidate Lifecycle Pipeline now refreshes automatically after successful training-registry persistence and MIO model-router preference changes.

## What to expect

- `LIVE SYNC` means the panel listens for local invalidation metadata.
- Several writes from one governed action are debounced into one refresh.
- The pipeline remains read-only; it only re-reads lifecycle state.
- The manual `REFRESH` button remains available.

## Important boundaries

Live sync does not run the action shown as `Next`.

It never automatically scans an adapter, runs MioBench, completes attestations, changes signer trust, promotes a candidate, or activates a model.

Mutation events do not carry stored values or model/training content. They only indicate that a storage namespace/key changed successfully.

If the panel reports a refresh error, use manual `REFRESH` after resolving the underlying storage/state issue. Do not treat a stale visual card as authority; lifecycle services and persisted evidence remain authoritative.
