<h1 align="center">v-conf-venue</h1>

<p align="center">
  Interactive 3D venue planner for v-conf Taiwan 2026 at NCCU CPBAE, Building A, 2F.
</p>

<p align="center">
  <a href="https://v-conf.vue.tw/">v-conf Taiwan 2026</a>
</p>

## About

`v-conf-venue` is a planning tool built for v-conf Taiwan 2026. It
models the second floor of Building A at [NCCU CPBAE](https://cpbae.nccu.edu.tw/cpbae-service-nx2/space/introduction) (政大公企) in 3D, covering
A201, A215, the A223 VIP lounge, and the A2 international conference hall.
The team can furnish the space and check the rental cost as they go.

The floor plan is modelled in metres from the venue's official dimension
drawings. The furniture catalogue follows the venue's rental price list
(附件五 家具設備租借費用表), and each 3D model is shaped and coloured after the
photos in the rental chart (家具設備租借費用圖表). Both are kept in [`docs/`](docs/).

## Experience

* Browse safely in view mode, then switch to edit mode to change the layout
* Drag furniture from the sidebar straight into the 3D venue
* Rotate, duplicate, delete, or lay out selected items in rows and columns
* Pick a colour for pieces that come in more than one (high stool, shaped sofa)
* Place stanchions and have belts link neighbouring posts automatically; click a belt to remove it
* Add people to the venue, seat them on chairs, sofas or A2's fixed seats, and give them tags (shown above their heads, with their own toggle); pick an existing tag or type a new one
* Set snack trays (cream puffs, black forest cake or egg tarts) on tables; they move with their table
* Mark zones on the floor: drop one in and drag its corners to size it on the grid, each with its own colour and tag (a separate tag list from people's)
* Hang your own posters on any wall, resize them by dragging a corner or typing a size, and upload an image that is saved with the layout and its JSON export (posters are not charged)
* See the rental total update live, with self-carry or carrying-service pricing across multiple time slots
* Jump between preset views: overview, top-down, A201, the A215 atrium, and the A2 hall
* Toggle grid snapping, cut-away walls, and room labels
* Move the camera with WASD or arrow keys, and undo with ⌘Z / Ctrl+Z
* Open the `?` button in the corner for every mouse, touch, and keyboard control
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
│   ├── furniture.ts        # catalogue: sizes, prices, colours, 3D models, thumbnails
│   ├── layout.ts           # layout format, pricing, import validation, storage
│   ├── materials.ts        # materials and modelling helpers
│   ├── places.ts           # room / facility labels, camera views
│   └── stanchions.ts       # which stanchion posts get linked by belts
├── stores/planner.ts       # layout snapshot, selection, pricing, view toggles
├── composables/            # useVenueEditor, useFurnitureThumbnails
├── components/planner/     # sidebar, palette, cost summary, stage, toolbars
└── views/PlannerView.vue
docs/
├── floorplans/             # source floor plans used for modelling
├── 附件五_家具設備租借費用表_.pdf   # rental price list
└── 家具設備租借費用圖表_.pdf        # rental chart with furniture photos
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

## License

[MIT](LICENSE) Copyright (c) 2026-PRESENT Wujue.
