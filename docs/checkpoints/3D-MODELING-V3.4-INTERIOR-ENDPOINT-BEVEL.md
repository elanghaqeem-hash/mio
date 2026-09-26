# 3D Modeling V3.4 — Interior Endpoint Fan Bevel

## Delivered
- Open-path rail resolution now supports interior endpoints without weakening closed-loop rules.
- At an open endpoint, the two side rails are derived from the two faces incident to the selected edge; the remaining non-selected edge is treated as the continuation fan spine.
- New guarded interior open-bevel solver for manifold valence-4 endpoint fans.
- Original endpoint vertices are retained as continuation fan spines.
- Two bevel-side vertices are created on the endpoint rails.
- Continuation-side faces are split by inserting the matching bevel-side vertex on each endpoint rail edge.
- One triangular termination cap closes each interior chamfer endpoint.
- Cap orientation is selected by topology winding consistency rather than a hard-coded orientation guess.
- Internal path vertices are replaced while endpoint spine vertices remain authoritative topology.
- Generic Open Bevel router automatically selects boundary or interior solver.
- Mixed boundary/interior endpoint paths are rejected.
- Material-boundary, width-space, manifold and winding guards remain enforced.
- Edit Mode Bevel Open now supports both boundary-terminated and guarded interior-terminated paths.
- Regression tests cover interior cube-loop subsets, manifold termination, generic routing, closed-loop rejection and width guards.

## Safety boundary
Interior termination currently requires the simple manifold valence-4 fan implied by exactly two side rails and one continuation neighbor. Branching, pole and mixed-boundary endpoint fans remain rejected rather than guessed.

## Next
- endpoint fan solver for higher-valence poles;
- multi-segment bevel profiles;
- interactive bevel preview/drag;
- configurable shortcut preferences and command palette.
