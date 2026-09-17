# TP-0.66 — Guided Lifecycle Navigation

Use the **Candidate Lifecycle Pipeline** in Settings to see the next governed model-lifecycle step.

When a stage shows **GO TO SURFACE**, the button only moves the Settings viewport to the existing control surface and briefly highlights it.

It does **not** execute the action. The operator must still use the normal controls and satisfy all existing confirmations, attestations, capability permissions, evidence checks, and runtime readiness requirements.

Typical destinations:

- adapter scan / MioBench → **Native Model Candidate Lab**
- handoff ↔ adapter binding → **Training Handoff ↔ Adapter Integrity**
- signed provenance / signer trust → **Model Provenance / Signer Trust**
- RELEASE_CANDIDATE review → **Training Candidates & Release Review**
- final promotion → **Final Model Promotion**
- activation → **MIO Local Model Lifecycle**

The pipeline displays the candidate ID. Confirm the candidate/model shown on the destination surface before taking any action.

Unknown navigation labels are not guessed. If a target surface is unavailable, no lifecycle action is performed.
