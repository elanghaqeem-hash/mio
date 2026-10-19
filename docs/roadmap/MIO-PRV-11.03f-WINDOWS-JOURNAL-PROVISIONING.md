# MIO PRV-11.03f — Windows Journal Provisioning Inspection

## Implementation
- A read-only inspector verifies a bounded manifest and a pre-existing empty, externally provisioned journal file inside a non-symlink root.
- Exact schema, expected filename, SHA-256 of the initial empty journal, file bounds and symlink checks enforce fail-closed diagnostics.
- Read-only inspection uses the existing framed journal validator. It creates no files, does not repair content, reclaim locks or grant mutation execution.
- Native Windows and normal test suites exercise missing journal, valid diagnostic, changed manifest, nonempty journal and unsafe name/symlink.

## Trust boundary
This is **only a provisioning inspection prototype**. A matching hash does not authenticate an attacker-controlled manifest, prove directory metadata is power-loss durable or establish secure ACLs. After the first journal append, the initial-empty snapshot is no longer sufficient and a separately reviewed runtime verification protocol is required. The inspector always returns `metadataPublicationDurable: false` and `activationPermitted: false`. No claim of Windows durable commit, no activation of Windows Creative Runtime, and no production deployment.

## Next milestone
Build independently authenticated provisioning and secure preallocation using a reviewed Win32 storage backend. Demonstrate durable namespace publication or a safe alternative on supported Windows storage; validate Windows full subprocess crash/restart and physical power-loss recovery prior to activation.
