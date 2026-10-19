# LAR-33 — MIO Desktop User Acceptance Test (UAT)

**Status: NOT EXECUTED.** This is an operator checklist, not evidence of a passing desktop test. Do not mark a check PASS without device logs or signed-off evidence.

## Test environment
Record Windows edition/build, device type, RAM, CPU, GPU/VRAM, Ollama version, model tag and digest, local gateway commit, installer artifact ID and SHA-256 hash. Use a clean Windows machine, not merely a GitHub runner.

## Acceptance matrix
| ID | Test | Expected result | Evidence |
| --- | --- | --- | --- |
| UAT-01 | Install unsigned CI NSIS build on a disposable Windows test machine | Installation succeeds; warning about untrusted publisher is recorded, not suppressed | Installer log and version |
| UAT-02 | Launch desktop application | Starts without crash; settings reachable | App startup log |
| UAT-03 | Install local Ollama and pull `qwen2.5:3b` | Exact model is available locally | Redacted `ollama list` and version |
| UAT-04 | Start `node scripts/local-ai-gateway.mjs` and open MIO Settings | Gateway is ready at `127.0.0.1:4318`; correct model displayed | Health status, screenshot |
| UAT-05 | Chat in local-only mode | Nonempty response, correct local model/provider, no cloud key | Redacted runtime log |
| UAT-06 | Disable internet and chat again | Response succeeds with Ollama running and local weights installed | Network observation and result |
| UAT-07 | Press STOP MIO while long generation is active | Request aborts, no late answer overwrites state | Abort log and UI recording |
| UAT-08 | Stop Ollama service and retry | Clear actionable failure; UI does not hang or falsely report ready | Error/status capture |
| UAT-09 | Restart Ollama and gateway; retry | Chat recovers without loss of unrelated settings | Runtime status |
| UAT-10 | Run 20 sequential and 5 concurrent prompts on device | No crash or cross-session state mixing; latency measured | Timing and resource report |
| UAT-11 | Restart MIO; then uninstall | Restart succeeds; uninstall documented; retained user data policy checked | Install/uninstall log |
| UAT-12 | Audit local mode network requests | No third-party model inference endpoint contacted | Redacted destination list |

## Exit criteria
- All 12 tests have PASS status with reproducible evidence; record deviations, owner, fixes and retest results.
- Model download requires internet once; inference should not require external model APIs afterward.
- Record cold/warm inference time, memory and CPU/GPU utilization on target hardware.
- Explicitly separate unsigned CI acceptance packages from signed production release artifacts.
- Fail closed on configured model mismatch or missing local gateway; do not silently fall back to cloud inference.
- No API keys, personal prompts or secrets in shared logs.

## Release verdict
**NO-GO** until real-device UAT is executed and signed off. CI tests with mocks are not a substitute.
