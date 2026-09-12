# MIO V2 — Unified Creative & Security AI Operating Environment

Mio V2 is a multimodal, agentic, context-aware, security-controlled creative AI operating environment. It provides native in-app capabilities for 3D creation, animation, graphic design, sound-effect generation, and music composition within an internal project sandbox.

---

## Key Principles & Architecture

- **One Core**: Iconic electric-cyan procedural Core communicating 18 reactive system states (`IDLE`, `LISTENING`, `THINKING`, `PROCESSING`, `3D MODE`, `SFX MODE`, `MUSIC MODE`, `SECURITY`, `ERROR`, etc.).
- **Zero External Creative Dependencies**: Native 3D engine (Three.js WebGL), timeline animation scrubber, Canvas 2D vector/raster graphics, procedural Web Audio SFX synth, and multi-track piano roll music studio.
- **Strict Security Hierarchy**: `System Safety > User Permission > Project Permission > Mode Permission > Tool Permission > AI Action`.
- **L0–L5 Permission Tiers**: Sensitive tasks (L4/L5) trigger an interactive Dry-Run / Preview dialog (`APPROVE`, `REVIEW`, `CANCEL`).
- **Global Emergency Stop (`STOP MIO`)**: High-priority interrupt halting generations, background loops, audio playback, and tool executions instantly.
- **Anti-Hallucination & Truth Separation**: Distinguishes `[VERIFIED]`, `[CORROBORATED]`, `[UNVERIFIED]`, `[INFERENCE]`, and `[UNKNOWN]`.
- **Offline & Local-First**: Fully functional offline using local procedural synthesis and heuristic planners, with a modular provider abstraction (`MioModelRouter`) for online LLMs.

---

## Workspace Modes

| Mode | Purpose | Engine / Stack |
| :--- | :--- | :--- |
| **CHAT** | Logical & Emotional reasoning, debate analysis | Web Speech STT/TTS, Agent Orchestrator |
| **RESEARCH** | Online/offline documentation & paper discovery | Untrusted data isolation, conflict detector |
| **FILES** | Semantic classification, duplicate scanning | Sandbox directory isolation, undo/rollback |
| **MOTION** | Optical pose & gesture tracking | Local camera permission gatekeeper, 33 landmarks |
| **3D** | Procedural 3D modeling & mesh editing | Three.js WebGL, parametric controls, OBJ export |
| **ANIMATION**| Kinetic keyframe timeline & track scrubber | Synchronized motion curves, playhead loop |
| **GRAPHIC** | Vector & typography poster/UI composition | HTML5 Canvas 2D, layer stack, PNG export |
| **SFX** | Procedural sound-effect synthesizer | Web Audio API nodes, ADSR, WAV export |
| **MUSIC** | MIO Music Studio (Piano Roll, Chords, Synth) | Polyphonic synth, copyright safety transformer |
| **PROJECT** | Unified `.mioproject` sandbox & pipeline | Cross-mode runner, version history snapshots |
| **SECURITY**| L0-L5 Permission Center & Security Log | Memory Manager, Prompt Injection defense |
| **SETTINGS**| Autonomy levels & resource quotas | Model Router, quota limits |

---

## Running the Application

### Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Running the System Security & Validation Audit
```bash
npx tsx -e "import { runMioTestSuite } from './src/tests/systemTests.ts'; runMioTestSuite();"
```
