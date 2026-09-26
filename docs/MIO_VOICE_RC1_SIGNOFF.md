# Mio Voice RC1 Signoff

The final automated result is intentionally limited to `blocked` or `candidate`. `candidate` means all supplied evidence satisfies the RC1 gates; it does not claim that a deployment or physical-device run occurred unless those evidence fields came from verified runs.

Before production release, attach actual CI references, deployment configuration verification, and measured iOS Safari, desktop Safari and Chromium acceptance evidence. Any missing or failed device family and any runtime prerequisite remains an explicit blocker.
