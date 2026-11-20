# MIO — Evolution / independent development
Baseline 2026-11-20: a388973f7a3e060e689ba752f33bf1c6e2d0b738 (PRV-11.03j).
Repository: elanghaqeem-hash/mio; product: MIO V2; app ID com.mio.v2.desktop. Original cyan core, existing creative workspace and desktop-first runtime. No dependency on Takane-Mio; no shared memory, credentials, database, deployment or automatic code synchronization. Preserve existing code and identifiers.
## Ordered gates
| ID | Scope | Acceptance |
|---|---|---|
| M-0.01 | Baseline and separation | Independent product contract; inventory and CI evidence |
| M-1.01 / PRV-11.03k | Windows native identity and journal safety | File handle identity, ACL, path race tests; fail closed |
| M-1.02 | Durable checkpoint | Native crash, restart, physical power-loss verification; no automatic replay |
| M-2.01 | Local model router | Ollama discovery, measured timeout/cancel, offline chat, honest unavailable state |
| M-2.02 | Agent orchestration | Permission gate, STOP, tool sandbox, trace, no unauthorized mutation |
| M-3.01 | Memory and file management | Consent, isolated store, retrieval, rollback, deletion |
| M-4.01 | Creative suite | 3D, animation, graphics, SFX, music: each export and undo tested |
| M-5.01 | Multimodal | STT/TTS, camera permission, offline capability matrix |
| M-6.01 | Release | Windows package, web smoke, security regression, recovery drill |
PRV-11.03j is logical only; Windows production checkpoint remains blocked. Do not remove CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS until native evidence and approval. No commercial cloud API required for final local inference. Release status requires test results tied to commit; no claims from source presence alone. No deployment in this phase.
