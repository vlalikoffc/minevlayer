import { Vec3 } from 'vec3'
import type { Block } from 'prismarine-block'

/**
 * Получить ID блока по имени. Учитывает версию сервера.
 */
export function getBlockId(bot: any, name: string): number | null {
  const normalized = String(name).toLowerCase()
  try {
    const block = bot.registry?.blocksByName?.[normalized]
    if (block) return block.id
  } catch {}
  // fallback через minecraft-data
  try {
    const mcData = require('minecraft-data')(bot.version)
    const block = mcData.blocksByName[normalized]
    if (block) return block.id
  } catch {}
  return null
}

/**
 * Получить ID предмета по имени. Если предмета нет — пробуем как блок.
 */
export function getItemId(bot: any, name: string): number | null {
  const normalized = String(name).toLowerCase()
  try {
    const item = bot.registry?.itemsByName?.[normalized]
    if (item) return item.id
  } catch {}
  try {
    const mcData = require('minecraft-data')(bot.version)
    const item = mcData.itemsByName[normalized]
    if (item) return item.id
  } catch {}
  return getBlockId(bot, name)
}

/**
 * Найти лучший инструмент в инвентаре для данного блока.
 * Возвращает индекс слота или null. Смотрит только основной инвентарь и хотбар
 * (слоты 9..44), чтобы не хватать броню/крафт/оффхенд.
 * Если передан allowedIds — рассматривает только предметы из списка
 * (например, только кирки, которые реально добывают этот блок).
 */
export function findBestTool(bot: any, block: Block, allowedIds?: number[] | null): number | null {
  let bestSlot: number | null = null
  let bestSpeed = -1
  const slots: any[] = bot.inventory.slots
  for (let i = 9; i < Math.min(slots.length, 45); i++) {
    const item = slots[i]
    if (!item) continue
    if (allowedIds && !allowedIds.includes(item.type)) continue
    let time: number
    try {
      time = block.digTime(item.type, false, false, false, item.enchants || [], [])
    } catch {
      continue
    }
    if (!time || time <= 0) continue
    const speed = 1 / time
    if (speed > bestSpeed) {
      bestSpeed = speed
      bestSlot = i
    }
  }
  return bestSlot
}

/**
 * Какие инструменты добывают этот блок (дают дроп).
 * Данные берутся из данных игры (minecraft-data), поэтому честно для любой версии:
 * например, золотая кирка быстрая, но алмазную руду ей добыть нельзя.
 * Возвращает null, если инструмент не нужен вовсе (земля, доски...).
 */
export function getHarvestTools(bot: any, blockName: string): { ids: number[], names: string[] } | null {
  const normalized = String(blockName).toLowerCase()
  let blockData: any = null
  try {
    blockData = bot.registry?.blocksByName?.[normalized]
  } catch {}
  if (!blockData) {
    try {
      blockData = require('minecraft-data')(bot.version).blocksByName[normalized]
    } catch {}
  }
  if (!blockData || !blockData.harvestTools) return null

  const ids = Object.keys(blockData.harvestTools).map(Number)
  const names = ids.map(id => {
    let name: string | undefined
    try { name = bot.registry?.itemsById?.[id]?.name } catch {}
    if (!name) {
      try { name = require('minecraft-data')(bot.version).itemsById[id]?.name } catch {}
    }
    return name ?? `#${id}`
  })
  return { ids, names }
}

/**
 * Привести что угодно к Vec3: Vec3 | {x,y,z} | [x,y,z].
 */
export function toVec3(v: any): Vec3 {
  if (v instanceof Vec3) return v
  if (Array.isArray(v)) return new Vec3(v[0], v[1], v[2])
  if (v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') {
    return new Vec3(v.x, v.y, v.z)
  }
  throw new Error(`Cannot convert to Vec3: ${JSON.stringify(v)}`)
}

/**
 * Похоже ли на сущность (есть position/type/id).
 */
export function isEntity(obj: any): boolean {
  return !!obj && typeof obj === 'object' && 'position' in obj && 'type' in obj && 'id' in obj
}

/**
 * Найти блоки по имени через bot.findBlocks.
 * Если имя неизвестно — матчим по имени/отображаемому имени.
 */
export function findBlocksForName(bot: any, blockName: string, maxDistance = 64, count = 1): Vec3[] {
  const id = getBlockId(bot, blockName)
  const needle = blockName.toLowerCase()
  const matcher = id !== null
    ? (b: Block) => b.type === id
    : (b: Block) => b.name === needle || b.displayName.toLowerCase().includes(needle)
  try {
    return bot.findBlocks({ matching: matcher, maxDistance, count })
  } catch {
    return []
  }
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms))
}

/**
 * Promise с таймаутом, который не оставляет висящих таймеров.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
