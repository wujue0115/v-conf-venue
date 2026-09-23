export type Vec3 = [number, number, number]

export interface RoomLabel {
  id: string
  name: string
  cap: string
  pos: Vec3
  /** Pixel offset of the tag above its anchor point */
  offset: number
}

export interface FacilityLabel {
  name: string
  pos: Vec3
}

export const ROOMS: RoomLabel[] = [
  { id: 'A201', name: '流光展廳', cap: '140 人', pos: [23, 4.2, -4.6], offset: 30 },
  { id: 'A215', name: '流光中庭展廳', cap: '150–250 人', pos: [17.2, 4.2, 10.2], offset: 30 },
  { id: 'A223', name: '貴賓休息室', cap: 'VIP', pos: [21.5, 4.2, 27.5], offset: 8 },
  { id: 'A2', name: '國際會議廳', cap: '300 席', pos: [19, 4.2, 37.6], offset: 30 },
]

export const FACILITY_OFFSET = 16

export const FACILITIES: FacilityLabel[] = [
  { name: '景觀梯', pos: [5.6, 3.5, 3.4] },
  { name: '樓梯', pos: [31.6, 4, 4.2] },
  { name: '電梯', pos: [31.4, 4, 7.6] },
  { name: '電梯廳', pos: [32.6, 1.5, 10.6] },
  { name: '電梯', pos: [31.4, 4, 13.6] },
  { name: '洗手間', pos: [32.6, 4, 17.3] },
  { name: '樓梯', pos: [31, 4, 21.4] },
  { name: 'A2 入口', pos: [30, 1.5, 27.5] },
  { name: '非開放空間', pos: [33.4, 4, 27.5] },
  { name: '舞台', pos: [32.6, 1.8, 37.6] },
  { name: '後台', pos: [35.8, 2.2, 37.6] },
  { name: '控制室', pos: [9.9, 3, 44] },
  { name: '翻譯室', pos: [33, 3, 46.5] },
]

export interface CameraView {
  name: string
  /** Camera position; null = overview framed to the viewport aspect */
  position: Vec3 | null
  target: Vec3
}

export const VIEWS: CameraView[] = [
  { name: '全景', position: null, target: [19, 0, 17.5] },
  { name: '俯視', position: [19, 110, 17.7], target: [19, 0, 17.5] },
  { name: 'A201', position: [23, 20, 13], target: [23, 0, -4] },
  { name: 'A215 中庭', position: [0, 26, 30], target: [18, 0, 11] },
  { name: 'A2 會議廳', position: [4, 14, 37.6], target: [30, 0, 37.6] },
]
