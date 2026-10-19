# MIO PRV-11.03h — Native Windows journal restart fault matrix

## Delivered
Adds a real independent-Node-process fault-injection test to the existing Windows journal prototype CI. Four child processes terminate abruptly with distinct exit codes: before PREPARED, after PREPARED, after EXECUTING, and after COMMITTED journal append. The parent reopens the pre-existing journal and verifies the complete chain with the PRV-11.03e logical commit verifier.

Expected outputs are NOT_FOUND, REVIEW_REQUIRED, REVIEW_REQUIRED, and LOGICALLY_COMMITTED respectively. The test requires the stale writer lock to remain present after all abrupt exits, denies automatic writer takeover, and confirms that read-only recovery does not alter journal records. All files live in newly created temporary fixture directories.

## Not demonstrated
- These are real **process exits**, not NTFS metadata power-loss durability or sudden computer shutdown.
- A LOGICALLY_COMMITTED entry does not certify that an associated 3D effect was committed, or even that directory metadata survived a power cut.
- This is **the isolated prototype**, not `MioCheckpointStorage` or the Windows Creative Runtime. The latter remains blocked by `CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS`.
- No hardware storage flush, Windows security ACL lifecycle, authenticated live-journal rotation, or native GUI automation was tested. No production deployment.

## Next acceptance
A reviewed native Windows storage layer must establish durable namespace provisioning and storage flush guarantees, then repeat these cases and the full creative artifact pipeline, including faults between journal and asset commits, before enabling the runtime.
