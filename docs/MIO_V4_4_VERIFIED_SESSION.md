# Mio Voice V4.4 — Verified Session Boundary

## Objective

Harden Mio's production synthesis gateway so "session required" means cryptographically verified or explicitly server-proven identity, not merely the presence of a browser-controlled identity header.

V4.4 keeps the existing Voice V4.3 behavior for synthesis, origin control, request limits, HTTPS-only upstream TTS, cancellation, streaming pass-through and deterministic device-TTS fallback.

## Security correction

V4.3 allowed two identity sources:

- Cloudflare Access user email header
- future Mio middleware subject header

Those headers were useful integration placeholders, but the custom subject header could be spoofed if a deployment exposed the route without a trusted middleware layer. Cloudflare's current guidance also recommends validating the Access JWT, rather than treating identity headers alone as sufficient origin-side proof.

V4.4 therefore makes identity resolution fail closed.

## Supported verification paths

### 1. Cloudflare Access

Configure:

- `MIO_CLOUDFLARE_ACCESS_TEAM_DOMAIN`
- `MIO_CLOUDFLARE_ACCESS_AUD`

The gateway reads `Cf-Access-Jwt-Assertion` and verifies:

1. JWT structure
2. `alg=RS256`
3. signing key `kid`
4. RSA-SHA256 signature against the Access JWKS endpoint
5. HTTPS issuer match
6. application audience match
7. expiration and not-before lifetime

Only then may the verified email or subject become the Mio Voice session identity.

The Access JWKS is cached in-memory for five minutes per isolate. The cache is a performance optimization only; it is not used as a quota or authorization store.

### 2. Trusted Mio middleware

A future Mio account/session service may inject:

- `x-mio-authenticated-subject`
- `x-mio-session-id` (optional)
- `x-mio-authenticated-subject-token`

The proof token must equal the deployment secret `MIO_VOICE_TRUSTED_SUBJECT_TOKEN`.

The token must never be placed in `VITE_*`, browser JavaScript, localStorage or other client-readable configuration. Trusted middleware must strip any browser-supplied copies of these headers before injecting its own values.

## Readiness behavior

When `MIO_VOICE_REQUIRE_SESSION=false`, provider readiness works as before.

When `MIO_VOICE_REQUIRE_SESSION=true`, HEAD/GET readiness now returns unavailable unless at least one verified-session path is configured. This prevents a deployment from reporting Voice production readiness while every synthesis request would actually fail authentication.

If runtime synthesis receives HTTP 401/503, Voice Runtime V3 retains the existing deterministic fallback to device TTS.

## Privacy boundary

Verified session identity is used only at Mio's gateway boundary. Session identity, Access JWTs and middleware proof tokens are not forwarded to the upstream neural-TTS provider.

Raw microphone audio and synthesized audio remain excluded from telemetry.

## Still pending after V4.4

1. Add deployment-native distributed per-subject and global synthesis quotas.
2. Select the separately licensed neural-TTS provider used for Mio's final production voice.
3. Add provider-specific mapping from Mio's abstract synthesis controls.
4. Add capability-detected incremental playback while preserving the tested iOS/iPadOS Blob fallback.
5. Run cross-device latency, interruption and vocal-character calibration.
