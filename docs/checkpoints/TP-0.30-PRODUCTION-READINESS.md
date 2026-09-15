# TP 0.30 — Production Readiness Hardening Checkpoint

## Scope

TP 0.30 closes the production-readiness debt explicitly carried forward from TP 0.29 without expanding MIO execution, filesystem, memory, network, or permission authority.

## Completed hardening

### 1. Lint debt removed
- Baseline at TP 0.29: 25 inherited warnings / 0 errors.
- TP 0.30 final Gate 1: **0 warnings / 0 errors**.
- Source fixes were used instead of suppressing lint rules.
- 3D cleanup now captures mutable refs safely at effect setup.
- Creative mode render/lifecycle warning debt was removed.
- SFX workspace import/lifecycle debt was removed while retaining local synthesis and export capability.

### 2. Vite configuration normalized
- Vite configuration is now ESM-native via `vite.config.mjs`.
- The previous CommonJS/ESM config-loader warning no longer appears in the production build.

### 3. 3D bundle split
- TP 0.29 / early TP 0.30 Studio3D lazy chunk: approximately **544.51 kB** minified.
- TP 0.30 final Studio3D view chunk: **9.89 kB** minified / **3.43 kB gzip**.
- Three.js vendor code is separated using size-based Vite/Rolldown code splitting:
  - `three-vendor`: **183.90 kB** / **49.42 kB gzip**.
  - `three-vendor`: **352.32 kB** / **84.71 kB gzip**.
- No emitted JavaScript chunk exceeds 500 kB in the final Gate 1 build.
- The prior large-chunk warning is absent.

### 4. Test runner version pinned
- Validation uses exact `tsx@4.23.13` instead of unconstrained `npx tsx` resolution.
- This prevents version drift between CI runs while keeping the existing test harness unchanged.
- This milestone uses exact-version `npx` execution rather than adding a new lockfile dependency.

### 5. SFX workspace cleanup
- Procedural Web Audio synthesis remains local-only.
- STOP MIO still suspends active audio context through the registered abort handler.
- WAV export still renders through `OfflineAudioContext` and `ExportManager`.
- Layer add/remove and bounded parameter editing are explicit UI actions.
- No cloud model, network, OS, filesystem, or memory authority was added.

## Gate 1 — verified head before checkpoint

Verified commit before this checkpoint: `47ec25e2772097ca66a2d5025a06df8e5aac42cb`.

- Dependency install/audit: **PASS — 0 vulnerabilities**.
- Lint: **PASS — 0 warnings / 0 errors**.
- Web production build: **PASS**.
- Electron main/preload build: **PASS**.
- Automated validation: **298/298 PASS**.
- Vite CJS/ESM configuration warning: **absent**.
- JavaScript chunk >500 kB warning: **absent**.
- `Studio3DView`: **9.89 kB / 3.43 kB gzip**.
- Largest Three.js vendor split: **352.32 kB / 84.71 kB gzip**.
- Main application chunk: **306.58 kB / 92.50 kB gzip**.

## Security and governance invariants

TP 0.30 is a hardening milestone only. It does not change the existing security constitution:

`SECURITY → PERMISSION → SANDBOX → VALIDATION → AUDIT`

The following remain unchanged:
- permission levels L0–L5;
- L4 dry-run and scoped approval requirements;
- L5 destructive single-use authority;
- STOP MIO revocation/cancellation behavior;
- DATA_ONLY treatment of external/project knowledge;
- governed memory promotion/deletion;
- bounded desktop workspace bridge;
- task runtime integrity requirements;
- evidence package disclosure boundaries.

## Remaining non-blocking platform debt

The CI runner reports upstream/dependency deprecation notices (for example GitHub Action runtime migration notices and transitive package deprecations). These are not MIO source lint errors and do not affect the TP 0.30 validation gate. They should be reviewed during dependency/toolchain maintenance rather than hidden or misclassified as application defects.

## Freeze rule

After this checkpoint commit, the milestone branch must remain unchanged until its frozen-SHA validation completes. The PR may merge only if the exact frozen SHA passes the validation gate against `refactor/mio-web-lab-v2`. `main` is not a merge target for this milestone.
