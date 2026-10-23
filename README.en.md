# Floor Plan Designer (floorplan-3d-pro)

> A **modular Pro rewrite** of the popular floor-plan design tool shared by [@akokoi1](https://x.com/akokoi1):
> migrated from a single `index.html` to a **Vue 3 + Vite + Three.js** project. Features, interactions and
> visuals stay the same, while the code is layered by AppShell regions (shell / workspace / domain core / state)
> so it can grow (multi-floor, loft mezzanines, walk-through, AI assistant, …).
> The single-file, build-free version lives in the parent directory.

[中文](README.md) | English

A pure front-end interior design tool: place furniture on a 2D plan, demolish or draw walls, carve out room areas,
measure distances, then switch to a Three.js 3D scene for an orbit view or a first-person walk-through.
Multi-floor and loft mezzanines are supported, along with wall materials, 3D quality presets and an optional AI assistant.

## Features

**2D layout**
- Real plan scales (1:60 / 1:100), all dimensions in mm
- Zoom goes down to 0.004 px/mm (1px ≈ 250mm): a 1000px-wide viewport shows ~250m at once, so malls, factories and other large plans fit on screen; when zoomed far out, room and furniture labels scale up to stay readable
- The library is split into **Home / Commercial / Outdoor** tabs (228 items): home (bedroom, living room, kitchen & dining, bathroom, appliances, study & leisure, partitions, floors), commercial (public, dining, retail), outdoor (garage, sports courts, water features, kids, landscape, road), plus real-estate sandbox pieces (18/26/33F towers, garden flats, townhouses, villas, retail podium, kindergarten, community gate, entry plaza, mirror pool, cascade wall, planting and context buildings), a basement garage set (garage module, roof & soil, entrance, stair core, skylight, fan room, fire shutter, accessible/tandem/compact stalls, speed bump, convex mirror, guidance sign) and traffic / landscape primitives (4/6-lane urban roads, intersection, traffic light, bus stop, metro entrance, barrier, bike and EV shelters, fire lane, turnaround, hidden fire lane, accessible ramp, garden path, stepping stones, boardwalk, dry fountain, stream, waterside deck, revetment, feature wall, sculpture, fence, signage, lawn and garden lamps, zelkova, tallow, palm, bamboo, flower beds, aquatic plants, tree grid, street trees, land parcel line), plus city context (slab blocks, towers, school, hospital, retail complex, city grid, river, lake, park, hill, metro line & station, power line, substation), marketing (sales center, model house, viewing walkway, hoarding, banners, lightbox), extra sports (half-court, gateball, skate park, loop trail, pet park, senior area), basement extras (civil defense, storage, equipment rooms) and construction (tower crane, foundation pit, construction road, material yard); custom 3D assets can be added
- Built-in layouts: flats (4-bed / 3-bed / 2-bed / 1-bed / studio), detached villa (3 floors), garden villa (with garage basement), loft, **mall sample (3 floors, 15 shops with glass shopfronts and paired elevators)** and an empty custom layout
- Move, rotate (`Shift` for free angle) and resize; snapping to walls and furniture edges (walls first). Nearby items of the same kind show dashed bounding boxes, and row / column **extension lines** let you line up items that sit far apart
- Furniture cannot pass through walls: dropping onto a wall or opening shows a red warning with the reason and reverts on release
- Measure tool with wall snapping, `Shift` locks the axis
- The browser's native context menu is **disabled inside the workspace**; an in-app context menu is used instead (see below)
- Import a floor plan image: walls and rooms are detected automatically and become editable geometry

**Walls & room areas**
- Demolish tool (`X`) switches the left panel to the wall-part library
  - **Walls**: partition / bearing walls drawn with click A → click B (always 90°, kept inside the envelope; starting on an existing wall snaps to its edge and branches perpendicular)
  - **Room areas**: drag a rectangle (or click A then B) to split the floor plate; walls and openings inside are cut out, both points snap to wall / area corners and edges, and a new area must touch a wall or an existing area
  - **Doors / windows**: door, entry door, double door, sliding door, window, bay window — only on partition or exterior walls (bearing walls cannot be opened), and the wall is split automatically
- **Wall materials**: select a partition wall and pick paint / wallpaper / wood panel / tile / stone / brick / glass. Glass is modelled as an aluminium-framed glass partition, and openings above it get glass too
- Wall segments merge automatically (extend / convert by overdraw), deleting an opening restores the original wall type, and materials follow their wall

**Multi-floor & loft**
- Level management: add / remove floors, switch the active level, mark any level as a loft, up to 3 basement levels
- A loft is its own plan: it has its own exterior walls and floor plate and does not inherit the floor below; voids keep their railings
- Up-going stairs (straight, L-shaped, spiral, escalator) automatically cut a hole in the loft slab above, and moving / rotating them updates the opening
- A loft layout must keep at least one staircase (the last one cannot be deleted / cleared)

**3D scene**
- Orbit, iso and top views; click a room in the list to fly to it
- Walk-through: `WASD` + mouse on desktop, virtual joystick on touch; starts outside the entry door, renders solid; areas without a floor are inaccessible, so you cannot fall through slab edges
- Section height presets: 2.8m / 3.5m / 4.5m / storey height (follows the current level automatically), plus a translucent exterior-wall toggle for inspecting the interior
- Sun-time slider, night lighting, "all floors" toggle (solid with furniture vs. translucent massing), roof and site toggles
- Engine-level interaction: click a barrier to raise its boom, click the community gate to slide it open, pulsing fountain jets
- Furniture drop-in: entering 3D or re-enabling "Furniture" drops the current level's furniture from above with a bounce; large sets are staggered to finish within 2s and the render loop only updates items already in flight
- Report calculations run in a Web Worker: garage connectivity / ramps / earthwork / massing metrics / net room areas (region booleans), with the main thread only receiving results and automatic synchronous fallback
- Performance HUD: View → Performance → Perf HUD shows FPS / draw calls / triangles / furniture / instances / wall runs / shadows in the bottom status bar
- Seasonal and night skins: spring petals / autumn leaves / winter snow particles, plus festive string lights in tree canopies at night
- Performance: trees / shrubs / cars of the same type and colour switch to `InstancedMesh` at 6+ copies; the selected instance is temporarily materialised so drag / rotate still work. Per-item furniture and whole-floor ghosts keep their material baking
- **Quality presets (performance)**: View → Performance → Auto / Low / Medium / High
  - "Auto" picks Low / Medium / High from the current platform and hardware (touch, CPU cores, memory)
  - Presets control render pixel ratio, antialiasing, shadows and shadow-map size, interior point-light count and environment reflections
- Door models: entry / room doors (wooden casing, recessed panel, handles on both sides) open by default and can be clicked; sliding doors are a casing with two glass leaves
- Detailed furniture models: door gaps and handles, upholstered headboards, metals and ceramics with environment reflections
- Furniture can also be selected and dragged in 3D, staying in sync with the 2D plan
- Help → **Model overview**: browse the 2D legend of the furniture library by category and preview any item in 3D (orbit, zoom, bounding box / dimensions / auto-rotate toggles)

**Context menu**
- Furniture: properties / stair direction / rotate CW & CCW / duplicate / delete
- Room or area: floor material & properties / delete
- Demolish mode, wall or opening: properties / convert to bearing or partition (exterior) / delete
- Right-click performs the same hit-test as a left click in the current mode (furniture → room in Select mode; opening → wall in Demolish mode) and clears the selection on empty space
- On touch, a 0.5s long-press equals a right-click; during drawing or measuring, right-click cancels

**Property panel**
- Rooms / areas: name, area, perimeter, width, depth, estimated wall area, floor material, ceiling light, furniture list
- Copy and available properties depend on the kind: **indoor room / indoor area** (counted in floor area, flooring, ceiling light); **outdoor area** (not counted, no ceiling or lights, ground level / terrace height); **bay window** (a component with a 0.45m sill)
- Floor materials are grouped into Indoor / Outdoor; the group matching the selected space comes first
- Furniture: size, colour, rotation, duplicate / delete, stair direction

**Plan & statistics**
- Automatic room area and counted floor area (stair openings and voids are deducted)
- Flooring cost estimate with 5% waste (indoor materials and outdoor paving are labelled separately)
- Massing metrics: site area from the **land parcel line** (or the site extent when absent), gross floor area from massing footprints × floors, plus FAR, coverage and green ratio (lawn / flower beds / tree grids / aquatic plants / roof soil), tied to stalls per household; the fallback basis is labelled in the panel
- Parking metrics and auto layout: right-click a room / area → **Auto parking layout**. Rectangular outlines get a garage module (rows adapt to depth, the long side becomes the parking direction); irregular or holed outlines are filled stall-by-stall, keeping only stalls whose four corners and centre are inside, with clipped aisle centre lines and a column grid added automatically. The overview panel aggregates total / EV / accessible / tandem / compact stalls across all floors, reports stalls per household and EV / accessible shares, and a **Garage Checks** list flags the household ratio, EV share, accessible stalls, garage entrance, aisle connectivity (whether every stall is reachable from an entrance) and ramp slope against rule presets (Basic / Standard / Premium), reports roof-soil and excavation estimates, and exports a CSV report of metrics, checks, connectivity, ramps and earthwork
- Undo / redo (150 steps); the plan is saved automatically in browser `localStorage`
- Chinese / English UI (Chinese by default, remembered)
- Export a PNG image; export / import the plan as JSON (all floors, furniture, areas, walls and openings — no view state)

**AI assistant (optional)**
- Bottom-right AI panel: ask the model in natural language to edit the plan (add walls, place openings, carve areas, place furniture, switch floors, …)
- Works with any OpenAI-compatible `/chat/completions` endpoint — DeepSeek, OpenAI, Qwen, Moonshot, Zhipu, local Ollama or vLLM: just fill in `baseURL + model + apiKey`. Streaming and reasoning modes are supported
- A local MCP bridge is also available (`?agent=1` or `window.__plan3d.enable()`, opt-in, `127.0.0.1:4317` only) for external agents / Playwright driven live preview

## Getting started

Node.js 18+ is required; pnpm is recommended:

```bash
git clone <repository-url>
cd <repository>/floorplan-3d-pro
pnpm install          # or npm install
pnpm dev              # dev server (http://localhost:5173)
```

Production build:

```bash
pnpm build            # outputs to dist/
pnpm build:single     # bundles into a single HTML file via vite-plugin-singlefile
pnpm preview          # preview the build
```

> The 3D scene uses [Three.js](https://threejs.org/) as an npm dependency — no network access is needed after building.
> The AI assistant needs your own model API key (Help → AI assistant settings; stored in your browser only).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `T` | Toggle 2D / 3D |
| `V` / `M` / `X` | Select / measure / demolish walls |
| `R` / `Shift + R` | Rotate the selected item 90° clockwise / counter-clockwise |
| `Delete` / `Backspace` | Delete the selection |
| `Ctrl/⌘ + D` | Duplicate the selected furniture |
| `Ctrl/⌘ + C`, `Ctrl/⌘ + V` | Copy / paste (works across floors) |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` | Undo, redo |
| `F` | Fit to window |
| `+` / `-` | Zoom in / out |
| `[` / `]` | Expand / collapse the left library and right panel |
| `Shift + F` | Fullscreen |
| `Esc` | Cancel the current action / close the context menu |
| Right-click (long-press on touch) | Select and open the context menu |
| Walk-through: `WASD` / arrows, `Shift`, mouse / joystick | Move, run, look around |

## 3D quality presets (performance)

Menu: `View → Performance`. Presets only affect rendering cost, never the plan data.

| Preset | Pixel ratio cap | Antialias | Shadows | Shadow map | Lights (day / night) | Environment |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 1 | off | off | 512 / Basic | 0 / 4 | off |
| Medium | 1.5 | on | on | 1024 / PCF | 4 / 8 | on |
| High | 2 | on | on | 2048 / PCF Soft | 4 / unlimited | on |

- **Auto** is not a preset of its own: clicking it resolves the device (touch, CPU cores, `deviceMemory`) to Low / Medium / High and applies that preset; the button shows which one is suggested.
- Pixel ratio, shadows, light count and reflections apply immediately. Antialiasing is fixed when the renderer is created, so it takes effect the next time you enter 3D.

## Sandbox asset conventions

- **Units & orientation**: all assets use real millimetres, anchored at the bottom centre, facing `+x` to match plan `rotate`; drag, rotate and snap do not depend on per-asset conventions.
- **Material slots**: 3D assets are split by material (walls / trim / glass / metal / roof / shopfront) and merged during baking; a typical asset ends up with 2–10 meshes, so hundreds of buildings stay within a manageable draw-call budget.
- **LOD**: at the site LOD the 2D plan draws only sandbox assets, never interior furniture; 3D furniture is baked per material + shadow setting. Repeated props such as trees and cars are still baked per instance — the next step is `InstancedMesh` / billboards.
- **Metrics share the source of truth**: building floor counts, garage layout and green-area types live in `core`, and the 2D icons, 3D models and metrics panel all read the same data, so drawn geometry and reported numbers cannot drift apart.

## Tech stack

- **Vue 3** (`<script setup>`) + **Pinia**
- **Three.js** r160 (OrbitControls, PointerLockControls, RoundedBoxGeometry, RoomEnvironment, CSS2DRenderer)
- **Vite 5**; `vite-plugin-singlefile` for the single-file build
- The 2D plan is drawn as **SVG**; geometry booleans and area math are hand-written pure functions
- Layered by AppShell region: `shell/` is layout only, `workspace/` is the content area, `core/` is framework-free logic, `stores/` is the single source of truth; imports use the `@/` alias
- All Chinese / English copy lives in `src/i18n.js`
- Plans are persisted in browser `localStorage` and restored on start-up

## Project structure

```
floorplan-3d-pro/
├─ index.html              entry HTML
├─ vite.config.js          Vite config (@ → src alias, single-file mode)
├─ src/
│  ├─ main.js              Vue + Pinia bootstrap
│  ├─ App.vue              App entry: AppShell + ToastHost, global lifecycle only
│  ├─ i18n.js              Chinese / English strings
│  ├─ app/                 App assembly layer
│  │  ├─ AppShell.vue      Five-region skeleton: header / side panels / workspace / status bar / overlay
│  │  └─ providers/
│  │     ├─ useShortcuts.js     global keyboard shortcuts
│  │     ├─ useFullscreen.js    fullscreen toggle
│  │     ├─ useProjectFile.js   plan JSON import / export
│  │     └─ useViewSwitch.js    2D ⇄ 3D switching (transition + busy lock)
│  ├─ ai/                  AI design assistant (optional)
│  │  ├─ AiPanel.vue            chat panel: streaming answers, tool results
│  │  ├─ AiConfigDialog.vue     model config (vendor presets / baseURL / model / key)
│  │  ├─ llm.js                 OpenAI-compatible gateway and vendor presets
│  │  ├─ agent.js               tool-calling loop (function calling)
│  │  └─ toolset.js             plan-editing tools (walls / openings / areas / furniture / levels…)
│  ├─ bridge/agentBridge.js    local MCP bridge (off by default, 127.0.0.1 only)
│  ├─ shell/               UI shell: one directory per screen region
│  │  ├─ header/AppHeader.vue   header: layouts, import/export, cut/translucent, quality, 2D/3D, language…
│  │  ├─ left-panel/
│  │  │  ├─ LibPanel.vue        furniture library / wall-part library (incl. room areas)
│  │  │  └─ RoomList.vue        room list (click to fly there in 3D)
│  │  ├─ right-panel/
│  │  │  ├─ PropPanel.vue       property panel, dispatched by selection
│  │  │  └─ panels/             Overview / Room / Furn / Elem
│  │  ├─ dialog/                import floor plan, model overview
│  │  ├─ status-bar/StatusBar.vue  status bar (cursor / scale / hints)
│  │  └─ overlay/
│  │     ├─ OverlayLayer.vue    overlay container (mode hint / scale bar)
│  │     ├─ LevelBar.vue        level switcher
│  │     └─ ContextMenu.vue     workspace context menu
│  ├─ workspace/           content area: full-screen 2D canvas and 3D scene
│  │  ├─ Workspace.vue     2D / 3D container (disables the native context menu)
│  │  ├─ plan2d/
│  │  │  ├─ PlanCanvas.vue            2D SVG plan (walls / openings / furniture / areas / dims / level below)
│  │  │  ├─ interaction/usePlanInteraction.js  drag / snap / draw walls / openings / areas / right-click & long-press
│  │  │  └─ render/                   SVG fragments: defs (patterns) / dims / measure
│  │  └─ view3d/
│  │     ├─ View3DHost.vue            Three.js canvas host and render loop
│  │     ├─ ModelPreview.vue          standalone preview used by the model overview
│  │     ├─ quality.js                quality presets and device detection
│  │     ├─ registry.js               global engine registry
│  │     ├─ coords.js                 plan mm ⇄ world m conversion
│  │     ├─ engine/
│  │     │  ├─ engine.js              engine class: constructor + fields
│  │     │  ├─ constants.js           constants (view distance / door height / stair types…)
│  │     │  └─ methods/               grouped prototype methods
│  │     │     ├─ build.js            architecture / openings / furniture / lamps
│  │     │     ├─ camera.js           views, flights, transitions
│  │     │     ├─ walk.js             walk-through, collision, slab lookup
│  │     │     └─ lifecycle.js        init / sync / quality / enter & exit / render loop / dispose
│  │     └─ build/
│  │        ├─ materials.js           material cache, floor / water materials, environment map
│  │        ├─ primitives.js          box / rbox / cylinder / lathe / handles / cabinet doors…
│  │        └─ furniture.js           3D models for furniture, appliances, stairs, sanitary ware
│  ├─ stores/              single source of truth
│  │  ├─ index.js          createPinia + store composition root
│  │  ├─ ui.js             UI state: tool, selection, context menu, layers, 3D display & quality, walk input
│  │  ├─ view.js           2D viewport: zoom / pan / fit / scale bar
│  │  └─ plan/             plan data (still exposed as usePlanStore(), split into sessions internally)
│  │     ├─ index.js            composition root, assembles the modules below
│  │     ├─ context.js          shared state, geometry cache, change broadcast
│  │     ├─ geometry.js         static geometry + user deltas → global geometry arrays
│  │     ├─ levels.js           levels / lofts / per-level snapshots and areas
│  │     ├─ history.js          undo stack and snapshots
│  │     ├─ furniture.js        furniture CRUD, snapping, cross-level clipboard
│  │     ├─ walls.js            draw / open / demolish / merge, wall materials
│  │     ├─ regions.js          area drawing, room deletion
│  │     ├─ imported.js         geometry produced by floor-plan import
│  │     ├─ constants.js        element prefixes, wall-type labels, …
│  │     └─ plans.js            layout switch / reset / import
│  ├─ core/                framework-free domain core
│  │  ├─ model/
│  │  │  ├─ plan.js             geometry helpers, floor materials & groups, wall segments, envelope
│  │  │  └─ level.js            resolveGeometry / regionRooms / slab hole trimming
│  │  ├─ geometry/
│  │  │  ├─ region.js           area / polygon booleans / slab and ceiling outlines
│  │  │  └─ wallMath.js         wall type checks (openable, thickness, merging)
│  │  ├─ library/
│  │  │  ├─ index.js            furniture factory `F`, library `LIB`, categories and snapping
│  │  │  ├─ furnSvg.js          2D SVG legends
│  │  │  ├─ wallItems.js        wall-part library (walls / doors / windows / room areas)
│  │  │  ├─ wallMats.js         wall material catalogue (incl. glass) and 2D/3D looks
│  │  │  └─ assets/             extensible custom assets (icon + 3D model + manifest)
│  │  ├─ import/                floor-plan import: image → walls / rooms → geometry
│  │  ├─ io/project.js          plan document serialization / deserialization
│  │  └─ plans/index.js         built-in layouts, static geometry (incl. loft), materials & prices, geoVersion
│  ├─ shared/              generic helpers without business meaning
│  │  ├─ ui/GlassCard.vue       frosted floating card
│  │  ├─ ui/ToastHost.vue       toasts
│  │  └─ dom/planSvg.js         plan <svg> element registry
│  └─ styles/
│     ├─ app.css                style entry: only @imports the files below in order
│     ├─ tokens.css             design tokens and global reset
│     ├─ shell.css              shell: layers / cards / header and menus
│     ├─ panels.css             side panels and property panel content
│     ├─ workspace.css          2D canvas / 3D scene / overlay / context menu
│     └─ responsive.css         narrow drawers / wide collapse / touch tweaks
```

## Custom layouts

Layout data lives in `src/core`:

- `core/plans/index.js` — `PLANS` describes each built-in layout (`LOFT_GEO`, `DEFAULT_GEO`, …): `walls`, `wins`, `doors`, `slides`, `rooms`, floor `regions`, plus `MATS` (indoor / outdoor groups split at `cement`) and unit prices.
- `core/library/index.js` — `LIB` defines the furniture library groups; `core/library/furnSvg.js` provides 2D legends and `workspace/view3d/build/furniture.js` the 3D models; `core/library/assets/` holds custom assets as `icon + model.js`.
- `core/library/wallItems.js` is the wall-part catalogue for the demolish panel, and `core/library/wallMats.js` the wall materials (a new material needs both a 2D fill and 3D material parameters).
- Loft geometry is provided through `levelGeos`; `geoVersion` drives local-save migration (bump it when geometry changes so old saves are recalculated).
- Put new code in the right layer: pure geometry / data in `core/`, UI in `shell/` or `workspace/`, state in `stores/`, imports via `@/...`.

Edit these definitions to make the tool your own; a new built-in layout appears in the header dropdown as soon as it is registered in `PLANS`.

## Credits

Special thanks to [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d): the "plan grows straight into a 3D home" experience was the initial inspiration, and many ideas and details here benefit from it.

## License

[MIT](LICENSE)
