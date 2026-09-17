# Operator Guide — TP-0.70 Promoted Runtime Live Status Sync

The `MIO LOCAL MODEL LIFECYCLE` panel now uses the same live invalidation signal as the Candidate Attention Queue and Candidate Lifecycle Pipeline.

## What changes automatically

After governed training/lifecycle evidence is successfully persisted, or model-router preferences change, the panel re-reads promoted model status and the promoted manifest list.

Examples include a new post-promotion integrity scan, provenance/trust changes, or promotion state changes.

## What does not happen automatically

Live sync does not activate a model and does not perform a live runtime readiness request. The `ACTIVATE` button remains the explicit activation boundary.

The panel also does not perform inference, change ModelRouter, promote a candidate, or create evidence.

A `LIVE STATUS REFRESH FAILED` message concerns only the read-only status refresh. It is kept separate from the result of an explicit activation attempt.
