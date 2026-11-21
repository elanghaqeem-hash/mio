# MIO — independent vital roadmap
Baseline: a388973f7a3e060e689ba752f33bf1c6e2d0b738 (PRV-11.03j).
MIO owns its original cyan Core, Electron desktop, native creative engines, local router, memory and security. No dependency on Takane Mio repository, runtime, credentials or storage. Preserve existing PRV numbering and APIs.

| Gate | Work | Acceptance |
|---|---|---|
| M-0.01 | Freeze baseline and inventory existing PRV evidence | commit and test inventory |
| M-1.01 | Continue PRV-11.03j Windows journal integration | native Windows crash/restart, single writer, fail-closed identity, no replay; no durability claim without evidence |
| M-1.02 | Core, emergency stop, IPC permission gates | cancellation and negative tests |
| M-2.01 | Local model router and Ollama gateway | real model response, timeout/cancel, offline and unavailable states; no cloud key required |
| M-3.01 | Memory, context, file sandbox and recovery | isolated data, backup/restore and consent |
| M-4.01 | Creative engines, voice, motion | real 3D/animation/graphic/SFX/music output, voice device acceptance |
| M-5.01 | Desktop and web release | native Windows installer smoke, CI and rollback evidence |

No automatic cross-repository sync, shared secrets or data. Keep MIO deployment and app identity unchanged. Start with M-1.01; do not enable production mutations until platform evidence passes.
