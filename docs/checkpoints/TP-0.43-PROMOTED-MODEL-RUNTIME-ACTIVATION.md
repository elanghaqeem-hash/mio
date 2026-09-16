# TP-0.43 — Promoted Model Runtime Activation

## Goal

Close the gap between MIO's training/model-governance lifecycle and the actual MIO Local runtime. A model that has passed TP-0.40 promotion can now be activated through a local inference backend only after runtime readiness is proven.

## Activation rule

A runtime model is never promoted by the activation service. Promotion remains a separate governance decision.

Activation requires an existing manifest with:

- lifecycle `PROMOTED`;
- valid model manifest schema;
- completed data-governance review;
- completed security review;
- a runtime model identifier that the selected local inference backend can report as available.

Release candidates, experimental models, retired models, invalid manifests, and unavailable runtime models are rejected.

## Runtime sequence

```text
PROMOTED manifest
      |
      v
PromotedModelActivationService
      |
      +-- validate manifest + reviews
      |
      +-- resolve local backend + loopback endpoint
      |
      +-- backend readiness check
      |      Ollama: /api/tags
      |      vLLM: /v1/models
      |      llama.cpp: /v1/models
      |
      +-- only if READY
             |
             +-- configure provider = mio_local
             +-- configure runtimeModel
             +-- configure selected backend/endpoint
             +-- persist active promoted pointer
```

## Atomicity behavior

The activation service snapshots the previous ModelRouter configuration. Runtime configuration is changed only after readiness succeeds. If persisting the promoted active pointer fails, the service attempts to restore the previous router configuration.

A failed readiness check does not change the current model.

## Runtime states

The service exposes four states:

- `NONE` — no active promoted-model pointer exists;
- `READY_TO_ACTIVATE` — a promoted model exists but MIO Local is not currently selected;
- `ACTIVE` — active promoted pointer and configured MIO Local runtime model match;
- `CONFIGURATION_DRIFT` — a promoted pointer exists but the configured MIO Local model was manually changed.

Drift is visible rather than silently overwriting the user's manual model selection.

## Settings UI

Settings now includes `MIO LOCAL MODEL LIFECYCLE`:

- current promoted-runtime state;
- active manifest and runtime model;
- all available `PROMOTED` model manifests;
- dataset/base-model/training-method metadata;
- explicit `ACTIVATE` action;
- readiness/activation success or failure detail.

The UI cannot promote a release candidate. It can only activate manifests that are already `PROMOTED` in the governed model registry.

## Security and privacy boundary

Runtime activation does not send model data, training data, project context, or prompts to the internet. It uses the TP-0.42 loopback-only local inference backend contract. If the model is not served locally, activation fails.

Remote inference remains a separate governed provider/network capability.

## Tests

TP-0.43 regression coverage verifies:

- promoted manifests can be listed without becoming active automatically;
- runtime activation performs backend readiness first;
- backend-family changes use the backend's safe loopback default;
- successful activation updates MIO Local provider/model/backend and active manifest pointer;
- active state is reported only when pointer and runtime configuration agree;
- manual model changes create `CONFIGURATION_DRIFT`;
- release candidates cannot bypass promotion;
- unavailable promoted models do not alter current runtime configuration.

## Recommended next checkpoint

TP-0.44 should connect the TP-0.41 read-only browser service to the MIO Local agent tool loop as a governed `browser.read` capability. Interactive browser actions should remain deferred to separate, higher-risk capabilities.
