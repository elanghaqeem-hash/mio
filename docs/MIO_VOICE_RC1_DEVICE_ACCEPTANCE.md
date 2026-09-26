# Mio Voice RC1 Real-Device Acceptance Matrix

Production acceptance requires measured evidence from:
- iPhone/iPad Safari (`ios-safari`)
- desktop Safari (`desktop-safari`)
- Chromium desktop (`chromium`)

For each required family record at least 3 completed playback samples, interruption recovery, long-session stability, zero observed rebuffers, and zero degraded samples for the acceptance run.

This matrix is a recording/evaluation contract; repository CI cannot fabricate device evidence. Firefox/other devices remain recommended compatibility coverage but do not replace the required three families.

Use ordinary Mio speech scenarios: Indonesian conversation, technical explanation, friendly/emotional reply, questions/confirmations, and barge-in. Never use performer cloning or biometric speaker matching.
