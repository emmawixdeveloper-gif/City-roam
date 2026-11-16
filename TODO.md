# City Roam TODO

## Procedural 3D city and expandable world — complete

- [x] Create a beautiful 3D open-world city environment with roads, buildings, houses, trees, streetlights and other city details.
- [x] Include realistic-looking roads, sidewalks, traffic lights and parked vehicles.
- [x] Make the city large enough to explore, with different streets and neighbourhoods.
- [x] Start with a detailed, expandable city environment and keep the project structured so future features such as vehicles, missions, jobs, shops, multiplayer and character customization can be added.
- [x] Use optimized 3D models and textures and use original or freely licensed assets.

## Third-person traversal and camera — complete

- [x] Add a third-person player character with smooth animations.
- [x] Allow the player to walk, run, jump and explore the city freely.
- [x] Implement a smooth third-person camera that follows the player.
- [x] Implement collision detection so players cannot walk through buildings and other solid objects.

## Cross-device controls and performance — complete

- [x] Add mobile touchscreen joystick controls for movement and camera rotation.
- [x] Add keyboard controls for PC users (WASD, arrow keys and spacebar).
- [x] Make the game compatible with Android, iPhone, tablets and computers.
- [x] Optimize graphics and performance for low-end mobile devices.
- [x] Make mobile controls comfortable and responsive.

## Atmosphere, audio and interface — complete

- [x] Add a beautiful day-and-night environment.
- [x] Add background music and environmental sound effects with volume controls.
- [x] Create an attractive game menu with Play, Settings and Exit options.
- [x] Create a clean, modern gaming interface.

## Technical and delivery requirements — complete

- [x] Use Three.js for 3D graphics.
- [x] Use JavaScript/TypeScript for game mechanics and HTML/CSS for the interface.
- [x] Organize the source code into understandable files.
- [x] Ensure the game runs directly in a web browser without requiring installation.
- [x] Make the interface responsive across mobile and desktop screens.
- [x] Build an actual playable 3D game, not just a 3D picture or static environment.
- [x] Ensure character movement and camera controls work properly.
- [x] Test the game and fix errors before presenting the final result.
- [x] Do not implement multiplayer yet.

## Verification evidence

- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes: 79 tests.
- [x] `pnpm build` passes, including the asset restore step and size check.
- [x] Preview returns HTTP 200 and `/manus-routes.json` is valid.
- [x] `pnpm smoke` passes in Chromium: desktop movement/jump/pause/settings and mobile HUD, with no console errors.
- [x] Generated courier asset is synced and the animated GLB is loaded through the Three.js runtime with a procedural fallback.
- [x] First-complete game sharing preparation is installed, the City Roam favicon is registered, and the build emits the sharing metadata.

## City-life environment transformation — in progress

- [x] Preserve the existing City Roam project rather than creating a new project; keep its Three.js and Rapier architecture, engine systems, physics, renderer, input system, asset loader, and project structure wherever possible.
- [x] Remove the old floating-island/energy-core/patrol-drone objective framing from the active game loop; the current world is a city exploration loop with no collectible objective.
- [x] Expand the explorable city with clearly readable realistic roads/highway connectors, residential neighbourhoods, tall buildings/apartments, shops and supermarkets, restaurants and shopping centres, petrol stations, parks/recreation areas, streetlights, traffic lights, sidewalks, pedestrian crossings, and neighbourhood road connections.

## Player and vehicle life — in progress

- [x] Preserve the animated human/courier character, third-person camera, walking/running, jumping, smooth movement, movement-facing rotation, camera follow, and collision detection.
- [x] Implement drivable cars with acceleration, braking, steering, reverse, entry, exit, and a driving HUD.
- [x] Preserve parked vehicles as part of the city detail.
- [x] Add lightweight basic AI traffic on the city road network.
- [x] Add a nearby interaction flow for entering/exiting cars and discovering city-life destinations.

## Controls — in progress

- [x] Preserve computer WASD/arrow movement, mouse camera, Space jump, and Shift sprint.
- [x] Add desktop interaction/vehicle entry and exit through E, with Space functioning as brake while driving.
- [x] Add mobile interaction, jump, sprint, camera drag, and vehicle-aware controls while preserving the existing left virtual joystick.

## Camera settings and view modes

- [x] Add fully functional FPS, TPS, Close Third-Person, and Wide Third-Person camera modes; these are real runtime perspectives, not settings-only labels.
- [x] Add a camera mode selector in the game settings and allow the mode to change while playing.
- [x] Add a dedicated mobile camera-switch button, preserve mouse camera control on PC, and preserve touchscreen camera rotation on mobile.
- [x] Add adjustable camera sensitivity, adjustable third-person camera distance, and camera inversion settings.
- [x] Keep the camera collision-aware so third-person views do not pass through buildings or solid objects; FPS eye/cabin positioning also performs a near-geometry correction.
- [x] Make camera transitions smooth when switching perspectives.
- [x] Save and restore the player’s preferred camera mode and distance through the existing local save system.
- [x] Verify FPS/TPS camera behavior while walking, running, jumping, and driving through browser smoke coverage.

## Day Shift starting system

- [x] Make 08:00 AM the default starting time for every new game.
- [x] Start the player at the existing basement/spawn entry during daylight and show a bright, naturally lit city when they exit.
- [x] Add a blue daylight sky, stronger morning sunlight, readable visibility, and naturally cast shadows while preserving the existing night lighting response.
- [x] Display DAY SHIFT at the default morning start instead of NIGHT SHIFT.
- [x] Keep the continuous day-night cycle functional through morning, afternoon, evening, and night.
- [x] Add a persisted Settings time-of-day control so players can intentionally choose another starting hour.
- [x] Verify the 08:00 time, Day Shift label, and time-setting control in browser smoke coverage.

## Living city and safe action systems — complete

- [x] Add civilian pedestrians throughout sidewalks, parks, and commercial streets with readable low-poly human silhouettes, deterministic walking routes, simple avoidance, and a panic/flee response to nearby pulse impacts.
- [x] Upgrade road traffic AI with lane-following, speed variation, separation gaps, bounded intersection behavior, and visible traffic continuing while the player explores on foot or drives.
- [x] Add a fictional, non-graphic pulse weapon/tool with desktop and mobile fire controls, cooldown feedback, a short-lived tracer/muzzle visual, and civilian reactions without blood or graphic injury.
- [x] Keep pedestrians, traffic, and pulse effects performant on low-end mobile devices and preserve the existing single-player/offline architecture.
- [x] Expose population, traffic, and pulse-tool state in the responsive HUD with localized English and Simplified Chinese copy.
