# TP-0.41 — Governed Browser Bridge

## Goal

Give MIO Local a native desktop browser capability for controlled page navigation and text extraction without granting the local model unrestricted network or DOM authority.

## Security model

- Browser capability is desktop-only and mediated by Electron IPC.
- Renderer callers can request HTTPS URLs only.
- Localhost, loopback, private-network, link-local, reserved IP space, embedded URL credentials, and non-HTTPS targets are rejected.
- Every Chromium network request is preflighted, including redirects and subresources, to reduce SSRF/private-network pivot risk.
- Browser sessions use ephemeral in-memory partitions, deny permission requests, disable Node integration, enable context isolation and Chromium sandboxing, deny popups and downloads, and use bounded timeouts.
- The first checkpoint is read-only: navigate + extract visible page text/title/final URL. No click, typing, credential storage, arbitrary caller-supplied JavaScript, uploads, downloads, or form submission.
- MIO CapabilityRegistry declares browser reading as L4/high-risk network access and the SecureServiceGateway remains the renderer-side authorization boundary.
- Extracted page text is labelled `UNTRUSTED_EXTERNAL` and must never be treated as instructions or authorization.

## Delivered scope

- `electron/ipc/browserReadSandbox.ts` — bounded Chromium runtime and network policy
- `mio:browser:readPage` IPC channel and trusted-frame handler
- preload method `browserReadPage`
- `service.desktop.browser.read-page` capability manifest entry
- `DesktopBrowserGateway` for scoped SecureServiceGateway execution
- origin/resource scope helper
- regression tests for fail-closed availability, HTTPS-only input, origin binding, and gateway registration

## Runtime path

```text
MIO Local / Orchestrator
        ↓
SecureServiceGateway
        ↓
CapabilityRegistry + L4 permission + resource/network budget
        ↓
DesktopBrowserGateway
        ↓
trusted preload IPC
        ↓
BrowserReadSandbox (hidden Chromium)
        ↓
HTTPS public internet only
        ↓
bounded visible text → UNTRUSTED_EXTERNAL
```

## Important boundary

TP-0.41 does not yet allow interactive browser actions. Click/type/scroll/download/upload/form-submit capabilities require separate capability IDs, per-action risk levels, scoped permission prompts, origin binding, anti-prompt-injection controls, and action receipts. This prevents a web page from turning read access into autonomous account or transaction authority.

## Recommended next checkpoints

- TP-0.42: vLLM + llama.cpp inference backend adapters
- TP-0.43: promoted-model activation service + Settings status UI
- TP-0.44: read-only browser tool integration into MIO Local agent loop
- Later: separately governed interactive browser action capabilities
