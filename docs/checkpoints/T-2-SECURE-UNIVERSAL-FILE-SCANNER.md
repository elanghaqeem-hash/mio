# T-2 Secure Universal File Scanner

Status date: 2026-09-29

## Scope

T-2 turns the T-1 bounded metadata foundation into Mio's secure universal discovery layer. Scanning remains read-only and workspace-scoped. Content parsing, hashing, cache, and incremental scanning are introduced only through explicit sub-stages.

## Timeline

- T-2.01#A — COMPLETE: recursive directory traversal uses the authorized workspace source.
- T-2.01#B — COMPLETE: configurable traversal depth plus existing file-count and byte budgets.
- T-2.01#C — COMPLETE: default and request-scoped exclusion rules.
- T-2.01#D — COMPLETE: hidden files are excluded by default and require explicit opt-in.
- T-2.02#A — COMPLETE: bounded signature-based MIME detection for initial image/video/audio/document/container formats.
- T-2.02#B — COMPLETE: known MIME signatures are checked against compatible filename extensions.
- T-2.02#C — COMPLETE: workspace header reads are capped at 512 bytes and remain within authorized paths.
- T-2.02#D — COMPLETE: unknown binary signatures remain unsupported rather than guessed; truncated known headers are flagged.
- T-2.03#A — COMPLETE: canonical relative name/path metadata.
- T-2.03#B — COMPLETE: bounded file size metadata.
- T-2.03#C — COMPLETE: created/modified timestamps.
- T-2.03#D — IN PROGRESS: signature/MIME metadata is integrated; richer media/document-specific metadata belongs to T-3–T-7.
- T-2.04#A — COMPLETE: bounded per-file SHA-256 evidence.
- T-2.04#B — COMPLETE: exact duplicates share deterministic SHA-256 fingerprints.
- T-2.04#C — COMPLETE: size/mtime drift during scan/hash is rejected as changed-file evidence.
- T-2.05#A — COMPLETE: authorized workspace containment inherited and regression-tested.
- T-2.05#B — COMPLETE: symlink breakout protection inherited and regression-tested.
- T-2.05#C — COMPLETE: absolute/parent path traversal protection inherited and regression-tested.
- T-2.05#D — COMPLETE: unknown/truncated signatures are isolated as unsupported/corrupt evidence rather than guessed.
- T-2.05#E — COMPLETE: directory entries, header bytes, file count, byte budget, traversal depth, and hash bytes are bounded.
- T-2.06#A — NEXT: bounded concurrent enrichment workers.
- T-2.06#B — COMPLETE: incremental reuse keyed by workspace/path/size/mtime.
- T-2.06#C — COMPLETE: immutable scan cache with workspace invalidation.
- T-2.06#D — COMPLETE: cooperative pause/resume/cancel checkpoints.
- T-2.07#A — PENDING: acceptance gate.

## Default exclusions

The scanner avoids hidden entries unless explicitly enabled and skips common high-volume/system locations such as .git, .svn, .hg, node_modules, $RECYCLE.BIN, and System Volume Information. User-requested exclusion names and extensions are additive.

## Security invariant

No T-2.01 contract grants create, write, rename, move, copy, delete, or external-upload authority.
