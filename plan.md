# City Roam implementation plan

## Scope

City Roam is an offline, single-player Three.js browser game prototype. The first checkpoint delivers a freely explorable third-person city with walk/run/jump traversal, camera orbit, desktop and mobile controls, collision-aware urban geometry, a day/night cycle, a responsive title/settings/pause HUD, synthesized ambience, and a foundation that can later accept vehicles, missions, shops, jobs, multiplayer, and character customization.

## Implementation approach

- Preserve the initialized TypeScript/Vite/Rapier engine, render loop, input abstraction, audio mixer, save store, and Tweak adapter.
- Replace the starter floating-island world with a deterministic, procedural city grid: roads, sidewalks, blocks, residential towers, storefronts, parks, trees, streetlights, traffic lights, parked cars, signage, and a river promenade.
- Keep the authoritative player controller on Rapier's kinematic character controller. Add a lightweight courier character built from shared low-poly primitives, with optional loading of the approved generated hero asset when it lands; use visual-only bob, stride, jump, and landing animation so collisions stay stable.
- Implement city blockers as static Rapier cuboids/cylinders from the same dimensions used by visible meshes. Movement remains camera-relative, and the existing follow camera gains the city-scale distance/fog framing.
- Drive the environment through a clock: sun angle, sky gradient, emissive windows, streetlamp intensity, and ambient colors change continuously. Keep the scene within a mobile-friendly light/material budget.
- Use the existing synthesized Web Audio BGM and SFX route with explicit settings sliders; add short city ambience cues without external audio dependencies.
- Keep UI strings in the existing English/Chinese catalogs and maintain responsive HTML/CSS overlays. Add a city title card, destination-style HUD, day clock, neighbourhood label, and mobile camera/movement touch affordances.

## Project structure

- `src/game/world.ts`: procedural city layout, materials, lighting, collisions, landmarks, day/night update.
- `src/game/player.ts`: third-person kinematic controller, courier model, locomotion animation.
- `src/game/camera.ts`: smooth orbit follow and collision-aware boom.
- `src/game/game.ts`: scene lifecycle, day clock, pause/title flow, HUD telemetry, interaction hooks.
- `src/engine/*`: preserved engine contracts for renderer, Rapier, audio, loop, save, and input.
- `src/ui/ui.ts`, `src/ui/touch.ts`, `src/styles/main.css`: responsive title/settings/HUD/pause/menu and dual touch joysticks.
- `src/i18n/*.json`: player-facing strings in the pinned English/Chinese locale set.
- `assets/models/`: authorized generated hero asset when available; procedural fallback remains checked in source.

## Design direction

Three sampled styles:

1. **Neon Cartography** — cool dusk gradients, warm window grids, transit-map accents, and clean wayfinding HUD. Probability: 0.07.
2. **Sunlit Civic** — bright midday pastels, terrazzo sidewalks, civic signage, and friendly neighborhood energy. Probability: 0.06.
3. **Rainline Noir** — reflective asphalt, restrained cyan/amber lighting, and cinematic late-night contrast. Probability: 0.04.

Chosen style: **Neon Cartography**.

- **Design movement:** a near-future transit-map interface layered over a warm, lived-in city at blue hour.
- **Core principles:** readable silhouettes, calm navigation, tactile surfaces, purposeful light, and mobile-first clarity.
- **Color philosophy:** deep blue-violet grounds the interface and makes amber windows and cyan navigation cues legible; coral marks interactive energy and safety feedback.
- **Layout paradigm:** asymmetrical title rail and edge-anchored HUD, leaving the city visible rather than covering it with centered panels.
- **Signature elements:** cyan route ticks, amber window mosaics, and thin bracket/corner framing around city telemetry.
- **Interaction philosophy:** controls feel like a transit console—direct, labeled, and forgiving; every action has a readable visual state.
- **Animation:** soft camera easing, low-amplitude character bob, window/light pulses, and smooth day-to-night interpolation; no distracting particles.
- **Typography system:** ManusCC0 display face for headings and controls, ManusCC0 body face for supporting text, with live labels rather than baked text.
- **Brand essence:** a quiet, polished city playground for exploring one more block; observant, kinetic, welcoming.
- **Brand voice:** concise, directional, and lightly cinematic. Example lines: “Take the long way home.” / “The city keeps moving.”
- **Wordmark & logo:** a compact route-pin monogram formed from two offset cyan/amber brackets around a central street dot.
- **Signature brand color:** route cyan `#72e9e1`, reserved for navigation, focus, and the game’s own visual identity.

## Delivery boundary

The first saved version is a playable prototype, not a production-scale open world. It prioritizes robust traversal, the requested urban mood, responsive controls, and a clean extension seam over asset-heavy simulation. No multiplayer, vehicles, missions, shops, jobs, accounts, or server features are included in this pass.
