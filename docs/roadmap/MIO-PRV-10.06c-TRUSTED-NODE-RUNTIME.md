# MIO-PRV-10.06c — Trusted Node runtime admission and exclusive writer lease

**Scope:** bounded runtime activation for a trusted Node host, not general desktop/web deployment.

## What is implemented
- `createTrustedNodeCheckpointRuntime(rootDirectory, options)` constructs a real `CapabilityProtocol` with the persistent mutation checkpoint gate and the PRV-10.06b fsynced Node backend. It requires an explicit absolute root path and host-provided registry, tool router and optional executors. No implicit browser or Cloudflare activation.
- `NodeCheckpointWriterLease` reserves a single writer for the entire archive directory with exclusive `O_EXCL` creation, a randomized ownership token, file fsync and directory fsync. A second instance is rejected while the lease exists.
- A crash leaves the lease in place. The system **does not steal or automatically expire** a stale lease; an operator must inspect/reconcile checkpoint archives and remove it through an audited external maintenance process.
- The leased gate rejects execution after lease loss and blocks graceful release while a mutation is in flight. The runtime's `close()` is intended only after operations have drained.
- Test cases include two-writer rejection, stale lease refusal, actual `creative.execute` capability invocation with durable checkpoints, restart replay denial, in-flight shutdown protection and ownership tampering.

## Known limitations / mandatory follow-up
- The current `AgentOrchestrator` remains a browser/shared renderer singleton and is **not switched** to Node storage. Electron workspace mutations continue using their separate durable checkpoint subsystem.
- This is an explicit trusted-host bootstrap, not an operational service launcher. There is no new Electron main-process request proxy, model/voice cross-engine integration, or deployment.
- The lock is advisory to code using this factory; direct callers of `NodeFileCheckpointStorage` bypass it. It is not an OS-wide mandatory lock or transactional CAS.
- A local filesystem attacker with write permissions can alter the lock or archives. Lock ownership tokens are not archive authentication or encryption.
- A lease that survived a crash intentionally blocks unattended startup; no automatic recovery, retry or lease deletion is permitted.
- Directory fsync support varies by OS; Windows process-kill and power-loss testing is still required.
- Runtime STOP, cancellation, and external side effects require MioBench end-to-end testing, including crash points and permission checks.
- A single-process gate can still have unresolved side effects after a timeout. Checkpoints must remain UNCERTAIN and undergo manual reconciliation.

## Next
PRV-10.06d: authorized Electron-main bridge to the trusted host with secure IPC, explicit startup ownership and read-only recovery inspection. Then PRV-11 MioBench fault-injection and real-platform acceptance.

**Production deployment:** not performed.
