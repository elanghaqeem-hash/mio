# Mio Voice V1 Provider Audio Verification

Provider-audio evidence must come from an authorized production synthesis request and may be marked verified only when the response is HTTP 200, has a supported audio content type, reports engine `v4.7`, reports `upstream-pass-through`, and contains non-empty audio bytes.

The evidence record should retain only sanitized measurements and a traceable run reference. Do not retain synthesis text, raw audio, API keys, gateway tokens, session identity or speaker biometric information in the acceptance manifest.

This verifies that the licensed provider path returned audio; it does not replace subjective listening QA or physical-device playback acceptance.
