# Mio Voice V1.0 Production Evidence Manifest

Production acceptance evidence must be traceable. Every verified item needs a non-empty reference and verification timestamp. A boolean without evidence is treated as unverified.

Accepted evidence sources are CI, deployment verification, physical-device validation and an accountable operator record. References may point to a CI run, deployment identifier, sanitized validation report or controlled operational record. Do not place secrets, session identifiers, transcript text, raw audio or speaker biometrics in references.

Physical-device evidence remains mandatory for iOS Safari, desktop Safari and Chromium. Repository tests validate the manifest logic only; they do not create real-world evidence.
