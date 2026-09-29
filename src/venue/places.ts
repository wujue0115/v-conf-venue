export type Vec3 = [number, number, number]

/** Room and facility names, and camera views' names, come from i18n by key/id */
export interface RoomLabel {
  id: string
  pos: Vec3
  /** Pixel offset of the tag above its anchor point */
  offset: number
}

export type FacilityKey =
  | 'scenicStair'
  | 'stairs'
  | 'lift'
  | 'liftLobby'
  | 'restroom'
  | 'a2Entrance'
  | 'closed'
  | 'stage'
  | 'backstage'
  | 'control'
  | 'interpreting'

export interface FacilityLabel {
  key: FacilityKey
  pos: Vec3
}

export const ROOMS: RoomLabel[] = [
  { id: 'A201', pos: [23, 4.2, -4.6], offset: 30 },
  { id: 'A215', pos: [17.2, 4.2, 10.2], offset: 30 },
  { id: 'A223', pos: [21.5, 4.2, 27.5], offset: 8 },
  { id: 'A2', pos: [19, 4.2, 37.6], offset: 30 },
]

export const FACILITY_OFFSET = 16

export const FACILITIES: FacilityLabel[] = [
  { key: 'scenicStair', pos: [5.6, 3.5, 3.4] },
  { key: 'stairs', pos: [31.6, 4, 4.2] },
  { key: 'lift', pos: [31.4, 4, 7.6] },
  { key: 'liftLobby', pos: [32.6, 1.5, 10.6] },
  { key: 'lift', pos: [31.4, 4, 13.6] },
  { key: 'restroom', pos: [32.6, 4, 17.3] },
  { key: 'stairs', pos: [31, 4, 21.4] },
  { key: 'a2Entrance', pos: [30, 1.5, 27.5] },
  { key: 'closed', pos: [33.4, 4, 27.5] },
  { key: 'stage', pos: [32.6, 1.8, 37.6] },
  { key: 'backstage', pos: [35.8, 2.2, 37.6] },
  { key: 'control', pos: [9.9, 3, 44] },
  { key: 'interpreting', pos: [33, 3, 46.5] },
]

export type ViewKey = 'overview' | 'top' | 'a201' | 'a215' | 'a2'

export interface CameraView {
  key: ViewKey
  /** Camera position; null = overview framed to the viewport aspect */
  position: Vec3 | null
  target: Vec3
}

export const VIEWS: CameraView[] = [
  { key: 'overview', position: null, target: [19, 0, 17.5] },
  { key: 'top', position: [19, 110, 17.7], target: [19, 0, 17.5] },
  { key: 'a201', position: [23, 20, 13], target: [23, 0, -4] },
  { key: 'a215', position: [0, 26, 30], target: [18, 0, 11] },
  { key: 'a2', position: [4, 14, 37.6], target: [30, 0, 37.6] },
]
