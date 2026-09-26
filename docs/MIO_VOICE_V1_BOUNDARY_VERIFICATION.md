# Mio Voice V1 Boundary Verification

Production session evidence requires an unauthenticated synthesis request to be rejected with 401 and an authorized request to succeed with the sanitized `X-Mio-Voice-Session: authenticated` marker. Do not record the session subject, token or session ID.

Distributed rate-limit evidence requires observing an actual quota denial from the shared production limiter: HTTP 429 with a bounded `Retry-After` value. Merely having a binding configured is readiness evidence, not enforcement evidence.

Run these probes only with authorized test identities and controlled quotas. Never weaken production authentication or exhaust another user's quota for validation.
