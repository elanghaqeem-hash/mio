# Mio Voice V4.3 — Authenticated Synthesis Boundary

V4.3 begins the transition from a protected synthesis endpoint to an application-session-bound production service.

## Implemented

- Optional `MIO_VOICE_REQUIRE_SESSION=true` enforcement at the synthesis gateway.
- Deployment-neutral session resolver.
- Cloudflare Access authenticated identity can be consumed through `cf-access-authenticated-user-email`.
- A future trusted Mio server middleware may inject `x-mio-authenticated-subject`.
- Session state is never forwarded to the upstream TTS provider.
- Readiness exposes only whether session enforcement is enabled.
- Existing V4.2 origin, body-size, HTTPS upstream, timeout, media validation and device-TTS fallback controls remain intact.

## Trust boundary

A raw identity header sent directly by an untrusted browser is not authentication. `x-mio-authenticated-subject` is reserved for a trusted reverse proxy/server middleware that strips client copies before injecting a verified subject. For immediate deployment, Cloudflare Access is the preferred supported identity boundary because the current repository does not yet contain a first-party Mio account/session service.

Do not enable `MIO_VOICE_REQUIRE_SESSION` until the deployment route is actually protected by one of these trusted layers; otherwise normal synthesis requests will receive HTTP 401 and Mio will fall back to device TTS.

## Distributed rate limiting

V4.3 deliberately does not add an in-memory counter. Cloudflare isolates do not provide a reliable global quota authority. Rate limits should be enforced through deployment-native rate limiting or a shared/durable store, keyed by authenticated subject/session where possible. This can be added once the production Cloudflare topology and desired quotas are confirmed.

## Next

1. Protect the production synthesis route with Cloudflare Access or Mio's future authenticated middleware.
2. Enable `MIO_VOICE_REQUIRE_SESSION=true`.
3. Add distributed per-subject and global synthesis quotas at the edge.
4. Select and configure a separately licensed neural-TTS provider.
5. Implement provider-specific mapping from Mio's abstract profile.
6. Add capability-detected incremental playback while preserving iOS/iPadOS Blob fallback.
