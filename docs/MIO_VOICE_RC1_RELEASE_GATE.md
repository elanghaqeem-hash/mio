# Mio Voice RC1 Production Release Gate

Mio Voice RC1 is code-complete only when CI passes. Production release additionally requires runtime evidence.

Required gates:
- CI validation passes.
- Real-device validation passes, including interruption recovery and long-session stability.
- Authenticated session protection is configured when required.
- A licensed production synthesis provider is configured server-side.
- If distributed rate limiting is required, the shared Cloudflare rate-limit binding is provisioned and verified.

RC1 must not be labelled production-ready solely from repository tests. iPhone/iPad Safari and representative desktop/browser playback remain runtime acceptance evidence.

Privacy boundary: calibration/observability must not retain raw audio, transcript text, provider secrets, or speaker biometric identity.
