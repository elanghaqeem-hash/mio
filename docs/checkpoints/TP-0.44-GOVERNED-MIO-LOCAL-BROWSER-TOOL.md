# TP-0.44 — Governed MIO Local Browser Read Tool

Status: implementation candidate pending CI validation

## Objective

Connect the read-only Chromium bridge introduced in TP-0.41 to the native MIO Local agent loop without giving the model direct Electron IPC or unrestricted browser control.

## Runtime path

```text
MIO Local model
  -> <MIO_TOOL_CALL>{"name":"browser.read","url":"https://..."}</MIO_TOOL_CALL>
  -> MioLocalBrowserToolRuntime
  -> DesktopBrowserGateway
  -> CapabilityRegistry
  -> SecureServiceGateway
  -> ResourceGovernor
  -> L4 scoped permission
  -> sandboxed Electron Chromium reader
  -> UNTRUSTED_EXTERNAL page evidence
  -> MIO Local final synthesis
```

## Capability boundary

`browser.read` is deliberately narrow:

- HTTPS page reads only.
- Desktop/Electron bridge only.
- ONLINE mode only at the ModelRouter feature boundary.
- Requires an active registered MIO task in CHAT or RESEARCH mode.
- Every request is scoped to the requested HTTPS origin and `browser-origin:<origin>` resource.
- Capability execution remains governed by TP-0.41 L4 permission, tool/network budget, cancellation and sandbox timeout.
- Page output is labelled `UNTRUSTED_EXTERNAL` before it is returned to the local model.
- Model-facing page text is additionally bounded to 30,000 characters.

The checkpoint does **not** enable click, type, form submission, account login, upload, download, arbitrary JavaScript execution, credential storage, or browser profile persistence.

## Agent protocol

Search remains a separate tool:

```json
{"name":"web.search","query":"search terms"}
```

A specific page read uses:

```json
{"name":"browser.read","url":"https://example.com/page"}
```

Both are transported inside the exact `<MIO_TOOL_CALL>...</MIO_TOOL_CALL>` envelope. Malformed, unsupported, or non-HTTPS browser tool envelopes are converted into a denied tool result rather than being surfaced as a successful assistant answer.

## Settings

MIO Settings now exposes separate controls for:

- Governed web search / research grounding.
- Governed desktop browser read-only capability.

The browser preference persists in controlled settings storage. Toggling it is an authorization-boundary change and invalidates stale model-routing grants.

## Failure behavior

- Browser disabled: the executor is never invoked; the model receives a `DENIED` result.
- Web/non-desktop runtime: browser bridge reports unavailable; MIO must not claim the page was inspected.
- Permission denial, resource exhaustion, cancellation or sandbox failure: browser evidence is not created.
- Invalid/non-HTTPS URL: rejected before the browser executor is invoked.
- Tool budget exhausted: the model is forced to produce a final answer and may not emit another tool call.

## Regression coverage

TP-0.44 adds tests proving that:

1. A bounded HTTPS `browser.read` call can be executed through the MIO Local tool loop.
2. Browser evidence is tagged `UNTRUSTED_EXTERNAL` before local-model synthesis.
3. Browser evidence becomes a normalized citation.
4. `browser.read` does not masquerade as web-search usage.
5. Disabling the capability prevents browser executor invocation.
6. Non-HTTPS/private URL tool calls are rejected before executor invocation.
7. Browser preference survives settings/runtime reinitialization.
8. Existing TP-0.41 desktop-browser gateway tests continue to enforce origin scope and capability permission boundaries.

## Next boundary

Interactive browser capabilities must be introduced as separate capability IDs with separate permission/risk policies. `browser.click`, `browser.type`, upload/download and authenticated actions must not be added by widening `browser.read`.
