# MIO PRV-11.02b — GUI Security Negative-Path Acceptance

The existing PRV-11.02 real Electron window/Xvfb smoke now also sends hostile and post-STOP requests **from the actual renderer through the compiled preload**, not by direct unit calls to the handlers.

Additional enforced checks:
- Renderer cannot request a trusted cube for an unauthorized workspace.
- Renderer cannot request an unknown creative template.
- Renderer cannot inspect a forged workspace-scoped artifact.
- Invalid requests must not open a native approval dialog.
- The renderer must not have direct Node `require` or `process` privileges.
- Emergency STOP latches creative operations; subsequent create and inspect calls fail without additional consent prompts.

This complements the existing real-window mouse-click tests for declined approval, approved creation, fsynced checkpoint, scene inspection and visible DOM node.

**Boundaries:** the test page remains an isolated fixture, not the complete Studio3D React route; consent responses are stubbed by the testing process. No physical power-loss, native dialog click automation, cross-platform OS matrix, or production deployment is claimed.
