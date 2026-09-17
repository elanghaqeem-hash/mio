# TP-0.67 — Candidate Lifecycle Deep Focus

## Purpose

TP-0.67 refines TP-0.66 guided navigation so the Candidate Lifecycle Pipeline can focus the specific visible candidate card on the destination Settings surface rather than only highlighting the entire panel.

This remains a UI-only navigation aid. It is not a lifecycle authority.

## Candidate context

The pipeline passes two existing read-only identities to the navigation helper:

- `candidateId` — used only as temporary focus metadata;
- `runtimeModel` — used to locate a unique visible candidate card inside the already-approved TP-0.66 surface.

No candidate record is written or changed by navigation.

## Fail-safe matching

Candidate-card focus is deliberately conservative:

1. navigation first resolves an allowlisted TP-0.66 surface;
2. candidate cards are searched only inside that surface;
3. runtime identity matching is case-sensitive and requires text boundaries;
4. exactly one matching card is required;
5. zero matches or multiple matches fall back to panel-level highlight;
6. unknown surfaces still fail closed.

Examples:

- `Mio-A` matches visible identity `Mio-A · EXPERIMENTAL`;
- `Mio-A` does **not** match `Mio-A2`;
- two visible cards containing the same runtime alias are treated as ambiguous and neither is selected.

This is navigation context only. Runtime model text is never promoted to a lifecycle primary key.

## Focus behavior

When a unique card is found, Mio:

- scrolls that card to the center of the Settings viewport;
- focuses it temporarily with `tabindex=-1`;
- applies a temporary cyan focus ring;
- places bounded `data-mio-navigation-focus-candidate` metadata on the focused element;
- restores the prior tabindex/metadata and removes the ring after 1.8 seconds.

If unique card focus is unavailable, the same temporary focus treatment is applied to the destination panel.

## Governance boundary

TP-0.67 never:

- selects an action button;
- opens an attestation form automatically;
- fills reviewer/promoter/signer fields;
- runs an integrity scan or MioBench;
- creates or changes evidence;
- changes signer trust;
- advances RELEASE_CANDIDATE;
- promotes or activates a model;
- changes ModelRouter;
- grants capability permission;
- performs network/model-runtime access.

All lifecycle actions remain on their existing governed surfaces.

## Regression contract

The TP-0.66 guided-navigation regression suite is extended to verify:

- bounded runtime identity matching;
- rejection of runtime-model prefix collisions;
- unique-match selection;
- ambiguous-match rejection;
- absent and blank identity fallback;
- non-browser fail-closed navigation with candidate context.
