import { Vec3 } from 'vec3'
import type { Bot } from '../index'
import type { Block } from 'prismarine-block'

/**
 * Получить ID блока по имени. Учитывает версию.
 */
export function getBlockId(bot: any, name: string): number | null {
  const normalized = name.toLowerCase()
  // пробуем через registry
  try {
    const block = bot.registry.blocksByName[normalized]
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

export function getItemId(bot: any, name: string): number | null {
  const normalized = name.toLowerCase()
  try {
    const item = bot.registry.itemsByName[normalized]
    if (item) return item.id
  } catch {}
  try {
    const mcData = require('minecraft-data')(bot.version)
    const item = mcData.itemsByName[normalized]
    if (item) return item.id
  } catch {}
  // также пробуем как блок
  return getBlockId(bot, name)
}

/**
 * Найти лучший инструмент в инвентаре для данного блока
 */
export function findBestTool(bot: any, block: Block): number | null {
  // используем встроенный bot.inventory + сравнение скорости
  // Упрощённо: ищем предмет с максимальной скоростью копания
  let bestSlot: number | null = null
  let bestSpeed = -1
  for (let i = 0; i < bot.inventory.slots.length; i++) {
    const item = bot.inventory.slots[i]
    if (!item) continue
    // получаем digTime для этого инструмента — чем меньше, тем лучше
    const speed = 1 / (block.digTime(item.type, false, false, false, item.enchants || [], []) || 9999)
    if (speed > bestSpeed) {
      bestSpeed = speed
      bestSlot = i
    }
  }
  return bestSlot
}

export function toVec3(v: any): Vec3 {
  if (v instanceof Vec3) return v
  if (Array.isArray(v)) return new Vec3(v[0], v[1], v[2])
  if (v && typeof v.x === 'number') return new Vec3(v.x, v.y, v.z)
  throw new Error(`Cannot convert to Vec3: ${JSON.stringify(v)}`)
}

export function isEntity(obj: any): boolean {
  return obj && typeof obj === 'object' && 'position' in obj && 'type' in obj && 'id' in obj
}

/**
 * Умный поиск блока: по имени или предикату
 */
export function findBlocksForName(bot: any, blockName: string, maxDistance = 64, count = 1): Vec3[] {
  const id = getBlockId(bot, blockName)
  const matcher = id !== null
    ? (b: Block) => b.type === id
    : (b: Block) => b.name === blockName.toLowerCase() || b.displayName.toLowerCase().includes(blockName.toLowerCase())

  try {
    return bot.findBlocks({ matching: matcher, maxDistance, count })
  } catch (e) {
    // fallback: ручной поиск
    return []
  }
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms))
}
