# Mio Voice V1.0 Production Acceptance

V1.0 may be marked accepted only from verified runtime evidence. Required evidence is: RC1 candidate status, production endpoint verification, successful licensed provider audio, verified authenticated session boundary, verified shared distributed rate limiting, and measured acceptance on iOS Safari, desktop Safari and Chromium.

Repository CI validates this acceptance evaluator but cannot set these evidence fields to true on behalf of a deployment or physical device. Until all evidence exists, the correct result is `blocked` with explicit blockers.

No raw audio, transcript, speaker biometric data, session identity or provider credentials belong in production acceptance evidence.
