# Mio Voice RC1 Evidence Bundle

Use the evidence bundle to combine measured device acceptance with production runtime readiness. Do not mark fields true unless supported by an actual CI result, real-device run, or verified deployment configuration.

Required device evidence: iOS Safari, desktop Safari and Chromium. Required runtime evidence: CI pass, session protection readiness, licensed production provider configuration, and—when required—a provisioned shared distributed rate-limit binding.

The evaluator produces blockers instead of assuming readiness. No raw audio, transcript, biometric speaker data, provider credentials or session identity belongs in the bundle.
