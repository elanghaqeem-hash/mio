# TP-0.67 — Candidate Deep Focus

From **Candidate Lifecycle Pipeline**, use **GO TO CANDIDATE** on a stage with an existing Settings destination.

Mio will:

- navigate only to the allowlisted Settings surface;
- try to find exactly one visible candidate card whose runtime-model identity matches the pipeline record;
- highlight that card temporarily when the match is unique;
- otherwise highlight only the destination panel.

Before taking the actual lifecycle action, confirm the visible candidate/model identity on the destination surface.

A deep-focus highlight is **not an approval**. It never presses the target button, fills forms, grants permissions, benchmarks, reviews, promotes, or activates a model.

If two cards expose the same runtime alias, Mio intentionally falls back to panel-level focus rather than guessing which candidate is intended.
