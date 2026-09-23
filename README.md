<h1 align="center">v-conf-venue</h1>

<p align="center">
  Interactive 3D venue planner for V-CONF Taiwan 2026 at NCCU CPBAE, Building A, 2F.
</p>

<p align="center">
  <a href="https://v-conf.vue.tw/">V-CONF Taiwan</a>
</p>

## About

`v-conf-venue` is a planning tool built for V-CONF Taiwan 2026 (10/17). It
models the second floor of Building A at NCCU CPBAE (政大公企) in 3D, covering
A201, A215, the A223 VIP lounge, and the A2 international conference hall.
The team can furnish the space and check the rental cost as they go.

The floor plan is modelled in metres from the venue's official dimension
drawings. The furniture catalogue follows the venue's rental price list
(附件五 家具設備租借費用表).

## Experience

* Drag furniture from the sidebar straight into the 3D venue
* Rotate, duplicate, delete, or lay out selected items in rows and columns
* See the rental total update live, with self-carry or carrying-service pricing across multiple time slots
* Jump between preset views: overview, top-down, A201, the A215 atrium, and the A2 hall
* Toggle grid snapping, cut-away walls, and room labels
* Move the camera with WASD or arrow keys, and undo with ⌘Z / Ctrl+Z
* Keep the layout saved in the browser automatically, and export or import it as JSON

## How It Works

```text
Floor Plan Drawings
        ↓
 Architecture (Three.js)
        ↓
  Furniture Catalogue
        ↓
     VenueEditor
        ↓
 Layout Snapshot (Pinia)
        ↓
  Vue UI · Rental Cost
```

`VenueEditor` owns the Three.js scene, including the camera, picking, dragging,
keyboard shortcuts, and undo history. It is the only place where object
positions are stored. After every change, it hands a serialized layout to the
Pinia store. Vue components read from the store and call editor methods to act
on the scene.

```text
src/
├── venue/                  # Three.js core, independent of Vue
│   ├── VenueEditor.ts      # scene, interaction, undo
│   ├── architecture.ts     # walls, floors, stairs, A2 fixed seating
│   ├── furniture.ts        # catalogue: sizes, prices, 3D models, thumbnails
│   ├── layout.ts           # layout format, pricing, import validation, storage
│   ├── materials.ts        # materials and modelling helpers
│   └── places.ts           # room / facility labels, camera views
├── stores/planner.ts       # layout snapshot, selection, pricing, view toggles
├── composables/            # useVenueEditor, useFurnitureThumbnails
├── components/planner/     # sidebar, palette, cost summary, stage, toolbars
└── views/PlannerView.vue
docs/floorplans/            # source floor plans used for modelling
```

## Development

```sh
pnpm install
pnpm dev          # start the dev server
pnpm build        # type-check and build for production
pnpm test:unit    # run unit tests with Vitest
pnpm test:e2e     # run end-to-end tests with Playwright (run `npx playwright install` first)
pnpm lint         # lint with oxlint and ESLint
```
