<h1 align="center">v-conf-venue</h1>

<p align="center">
  Interactive 3D venue planner for v-conf Taiwan 2026 at NCCU CPBAE, Building A, 2F.
</p>

<p align="center">
  <a href="https://v-conf-venue.wujue.dev">v-conf-venue</a>
</p>

## About

`v-conf-venue` is a planning tool built for [v-conf Taiwan 2026](https://v-conf.vue.tw/). It
models the second floor of Building A at [NCCU CPBAE](https://cpbae.nccu.edu.tw/cpbae-service-nx2/space/introduction) (政大公企) in 3D, covering
A201, A215, the A223 VIP lounge, and the A2 international conference hall.
The team can furnish the space and check the rental cost as they go.

The floor plan is modelled in metres from the venue's official dimension
drawings in [`docs/floorplans/`](docs/floorplans/).

The furniture catalogue, with each item's size, price and look, follows the
venue's rental documents in [`docs/furniture/`](docs/furniture/).

## Experience

* Browse safely in view mode, then switch to edit mode to change the layout
* Drag furniture from the sidebar straight into the 3D venue
* Rotate, duplicate, delete, or lay out selected items in rows and columns
* Show or hide items, their tags or their notes by kind from the settings panel
* Switch the interface between Chinese and English in the settings panel (the first visit follows the browser's language)
* Colour rows grow with every custom colour you pick, and can be reordered by dragging, retuned, pruned or reset (kept in the browser and exported with the layout)
* Pick a colour for pieces that come in more than one (high stool, shaped sofa)
* Place stanchions and have belts link neighbouring posts automatically; click a belt to remove it
* Add people to the venue and seat them on chairs, sofas or A2's fixed seats
* Tag anything: a tag floats above its item (a person's wears their colour; pick a colour for any other item's) and you pick an existing tag or type a new one
* Add a note to anything: a small ⓘ appears above it (right of its tag) and opens the note
* Set snack trays (cream puffs, black forest cake or egg tarts) and aluminium laptops (13"–16" and six colours, picked separately, with the lid opened to any angle and your own image on the screen) on tables; they move with their table
* Mark zones on the floor: drop one in and drag its corners to size it on the grid, each with its own colour and tag (a separate tag list from other items')
* Hang your own posters on any wall, resize them by dragging a corner or typing a size, and upload an image that is saved with the layout and its JSON export (posters are not charged)
* See the rental total update live, with self-carry or carrying-service pricing across multiple time slots (both are saved in the exported JSON, so an import works the total out the same way)
* Group items: clicking one picks up the whole group to move together, framed in the group's colour; a group has its own tag, tag colour and note above it, and the layout list shows each group on its own
* Tick items in or out of the total, per kind or one by one (in the layout list or an item's panel), and click one in the list to fly to it (and select it in Edit mode)
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
├── i18n/                   # 中文 / English messages (zh.ts is the source, en.ts matches it)
├── stores/planner.ts       # layout snapshot, selection, pricing, view toggles
├── composables/            # useVenueEditor, useFurnitureThumbnails
├── components/planner/     # sidebar, palette, cost summary, stage, toolbars
└── views/PlannerView.vue
docs/
├── floorplans/             # source floor plans used for modelling
└── furniture/              # rental price list and rental chart with furniture photos
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
