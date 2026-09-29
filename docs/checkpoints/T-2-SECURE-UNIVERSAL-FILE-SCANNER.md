# T-2 Secure Universal File Scanner

Status date: 2026-09-29

## Scope

T-2 turns the T-1 bounded metadata foundation into Mio's secure universal discovery layer. Scanning remains read-only and workspace-scoped. Content parsing, hashing, cache, and incremental scanning are introduced only through explicit sub-stages.

## Timeline

- T-2.01#A — COMPLETE: recursive directory traversal uses the authorized workspace source.
- T-2.01#B — COMPLETE: configurable traversal depth plus existing file-count and byte budgets.
- T-2.01#C — COMPLETE: default and request-scoped exclusion rules.
- T-2.01#D — COMPLETE: hidden files are excluded by default and require explicit opt-in.
- T-2.02#A — NEXT: MIME detection.
- T-2.02#B — NEXT: extension/MIME consistency validation.
- T-2.02#C — NEXT: bounded magic-byte signature validation.
- T-2.02#D — NEXT: unsupported/corrupt-file detection.
- T-2.03#A–#D — PARTIAL: name/path/size/timestamps exist; richer media/document metadata pending.
- T-2.04#A–#C — PENDING: hashing, duplicate fingerprint, changed-file detection.
- T-2.05#A–#E — PARTIAL: workspace containment, symlink and path traversal defenses inherited from T-1; malformed/resource protections continue in T-2.
- T-2.06#A–#D — PENDING: concurrency, incremental scan, cache, pause/resume.
- T-2.07#A — PENDING: acceptance gate.

## Default exclusions

The scanner avoids hidden entries unless explicitly enabled and skips common high-volume/system locations such as .git, .svn, .hg, node_modules, $RECYCLE.BIN, and System Volume Information. User-requested exclusion names and extensions are additive.

## Security invariant

No T-2.01 contract grants create, write, rename, move, copy, delete, or external-upload authority.
