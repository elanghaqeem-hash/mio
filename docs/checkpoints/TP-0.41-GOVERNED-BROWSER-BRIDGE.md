# TP-0.41 — Governed Browser Bridge

## Goal

Give MIO Local a native desktop browser capability for controlled page navigation and text extraction without granting the local model unrestricted network or DOM authority.

## Security model

- Browser capability is desktop-only and mediated by Electron IPC.
- Renderer callers can request only HTTPS URLs.
- Localhost, loopback, private-network, link-local, file, data, javascript, and non-HTTPS targets are rejected.
- Browser sessions are ephemeral hidden Chromium windows with Node integration disabled, context isolation enabled, sandbox enabled, popups denied, downloads denied, and bounded timeouts.
- The first checkpoint is read-only: navigate + extract visible page text/title/final URL. No click, typing, credential storage, arbitrary JavaScript, uploads, downloads, or form submission.
- MIO CapabilityRegistry declares browser reading as L4/high-risk network access and the SecureServiceGateway remains the renderer-side authorization boundary.
- Extracted page text is untrusted external data and must never be treated as instructions or authorization.

## Delivered scope

- Electron IPC browser-read channel
- `BrowserReadSandbox` with URL policy and bounded extraction
- preload bridge method `browserReadPage`
- desktop service bridge exposed through the MIO secure service layer
- capability manifest entry for `service.desktop.browser.read-page`
- automated security/bridge tests

## Deferred

Interactive browser actions (click/type/scroll/download/upload) require separate capability IDs, explicit per-action risk levels, scoped permission prompts, origin binding, and stronger anti-prompt-injection controls. They are intentionally not enabled by TP-0.41.
