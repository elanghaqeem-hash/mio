# MIO PRV-11.02 — Native Electron GUI Smoke Test (Xvfb)

## Implemented

A new CI job launches an actual Electron BrowserWindow under an Xvfb virtual display, with the compiled production preload and the existing Electron Main IPC handlers. A GUI mouse-click triggers the narrow trusted-cube flow from a minimal isolated HTML test fixture:

1. An Electron workspace authorization dialog method is invoked and returns a fresh, disposable test workspace.
2. First click returns a **cancelled native approval** response; no visible imported scene is created.
3. Second click returns a positive approval; the existing trusted runtime persists a real deterministic cube and COMMITTED checkpoint.
4. The existing main-process inspector verifies the project-scoped scene and the GUI adds a visible DOM node only when asset identity and geometry match.
5. CI asserts both real BrowserWindow click dispatch and the invocation counts for workspace selection and approval.
6. Renderer uses the real context-isolated preload bridge and main-frame-verified IPC handlers; no filesystem access or privileged callback is injected into the renderer.

**Important qualification:** This is a **real Electron window + mouse event + native IPC smoke**, but the native OS dialogs are test-controlled, not clicked manually, and the HTML fixture is not the full React Studio3DView. The test does not assert WebGL frame rendering, save/reopen of a Studio document, or full navigation through Mio's shell. The previous PRV-11.01 independently verified process exit/crash recovery. GUI input and IPC testing do not prove physical power loss or production readiness.

## Run
- Local Linux with Xvfb and Electron dependencies: `npm run build:electron && npm run test:electron-gui`
- GitHub Actions: `Mio CI / Electron 3D GUI Smoke (Xvfb)`

## Next
Native Studio3DView navigation and WebGL pixel smoke, OS-specific Windows/macOS Electron tests, plus manual dialog and STOP acceptance prior to PRV-12. No deployment.
