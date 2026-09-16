# Creative Engine 1.4 — Photo Editing Workspace

## Scope

This checkpoint adds a native `.miophoto` workspace using familiar Photoshop and Lightroom develop concepts while preserving Mio's shared local document, history, autosave, and permission boundaries.

## Delivered

- First-class Photo Editing entry in Creative navigation.
- Local image import stored as a project document source without network upload.
- Nondestructive exposure, contrast, saturation, temperature, tint, grayscale, sepia, blur, and vignette adjustments.
- Natural, Vivid, Mono, Warm, and Film presets plus neutral reset.
- Hold-to-preview original image for before/after comparison.
- Layer visibility, locking, opacity model, selection, local canvas preview, and permission-gated PNG export.
- Drawing and Photo exports now emit their correct activity mode rather than the Graphic mode default.

## Capability matrix

| Area | Ready in 1.4 | Deferred |
|---|---|---|
| Import | Browser-supported local images | RAW decoding, camera tethering, cloud library |
| Develop | Exposure, contrast, saturation, temperature, tint | Curves, HSL mixer, tone ranges, lens profiles |
| Effects | Grayscale, sepia, blur, vignette | Grain, dehaze, sharpening, noise reduction |
| Layers | Multiple imported layers, visibility, lock, opacity data | Masks, blend-mode UI, smart objects, compositing transforms |
| Comparison | Hold-before original preview | Split view, history snapshots, reference view |
| Export | Permission-gated PNG | JPEG/WebP quality controls, TIFF/PSD, color profiles |
| AI | Not claimed | Generative fill/remove requires separately governed providers |

## Compatibility and safety

- `.miophoto` already mapped to the shared `photo` document kind; no format rename or parallel persistence system is introduced.
- Adjustments remain separate from `sourceDataUrl`, so reset and undo never rewrite the imported source.
- All structural changes enter the command bus and survive undo, redo, autosave, recovery, and reopen.
- Imported images remain local in configured storage; no cloud call or provider secret is introduced.

## Validation gate

- Lint, TypeScript, web/Electron builds, release checks, and full tests pass.
- Regression coverage proves nondestructive adjustment history, repository reopen, and normalized layer flags.
- GitHub Validation and Cloudflare Web Build pass before merge.

## Next checkpoint

Deliver native 2D/Motion Graphics using the shared timeline, then expand the SFX and Music workspaces.
