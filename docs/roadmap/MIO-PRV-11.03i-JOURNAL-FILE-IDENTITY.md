# MIO PRV-11.03i — Windows Journal File Identity Hardening

This increment hardens the non-production Windows journal prototype against opening unexpected files. Both read and append now reject symbolic links and nonregular files, apply no-follow where available, and check file identity before and after access. POSIX platforms also compare inode/device identity. Tests verify directories and symlinks are denied, while a regular preprovisioned journal remains readable and writable.

## Security limitations

Windows Node file identifiers have shown inconsistent values across handle/stat APIs. On Windows, the added checks are best-effort validation; they do **not** close every possible race where a malicious local process replaces a pathname between operations. The appropriate remedy is a reviewed native Windows file-handle implementation with stable file IDs and controlled share flags, together with trusted provisioning and ACL enforcement. The code deliberately does not mark physical durability or runtime activation as verified.

Existing `CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS` behavior remains unchanged. This is NOT a production backend, not power-loss evidence, and not a Windows 3D runtime enablement. No deployment.
