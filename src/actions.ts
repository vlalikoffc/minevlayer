import { getItemId } from './helpers'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'

/**
 * Универсальные действия: работают в любом режиме — выживание, SMP, анархия, миниигры.
 * Режим-специфичные знания (бедварс-шопы, киты и т.п.) живут в модулях поверх этих примитивов.
 *
 *   await bot.use('lever')             // дёрнуть рычаг / открыть дверь / сундук
 *   await bot.attackNearest('zombie')  // атаковать ближайшего подходящего
 *   await bot.pickup()                 // подобрать ближайший дроп
 *   await bot.give('Steve', 'diamond', 2)  // передать предметы игроку
 *   bot.antiAfk()                      // не кикает за АФК (анархия, гриферские сервера)
 */

export function injectActions(bot: any) {
  // ---------- ВЗАИМОДЕЙСТВИЕ С МИРОМ ----------

  /**
   * Использовать ближайший блок: рычаг, дверь, кнопка, сундук, верстак...
   * Сам дойдёт и активирует. Для контейнеров вернёт открытое окно.
   */
  bot.use = async (target: string | Block): Promise<any> => {
    let block: Block | null
    if (typeof target === 'string') {
      block = bot.findNearest(target, 32)
      if (!block) throw new Error(`No usable "${target}" found within 32 blocks`)
    } else {
      block = target
    }
    try {
      await bot.goto(block.position, { range: 2.5 })
    } catch { /* попробуем активировать с текущего места */ }
    return bot.activateBlock(block)
  }

  // ---------- БОЙ ----------

  /**
   * Атаковать ближайшую подходящую цель.
   * Цель: имя ('zombie', 'player', 'Steve') или предикат (entity) => boolean.
   * С установленным mineflayer-pvp дерётся умно, иначе — простой атакой.
   */
  bot.attackNearest = async (match: string | ((e: Entity) => boolean), radius = 16): Promise<Entity | null> => {
    const matcher: (e: Entity) => boolean = typeof match === 'function'
      ? match
      : (e: any) => e.name === match || e.username === match || e.type === match
    const target: Entity | undefined = bot.nearestEntity(matcher)
    if (!target) return null

    const dist = bot.entity?.position?.distanceTo((target as any).position) ?? Infinity
    if (dist > radius) {
      // цель за пределами радиуса — не дотянемся
      return null
    }
    // подойдём вплотную, если далеко
    if (dist > 3.5) {
      try { await bot.goto((target as any).position, { range: 3 }) } catch { /* бьём откуда есть */ }
    }
    if (bot.pvp) {
      const p = bot.pvp.attack(target)
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } else {
      bot.attack(target)
    }
    return target
  }

  // ---------- ПРЕДМЕТЫ ----------

  /**
   * Подобрать ближайший валяющийся предмет: дойти до него (дроп подберётся сам).
   * Вернёт сущность дропа или null, если рядом ничего нет.
   */
  bot.pickup = async (radius = 16): Promise<Entity | null> => {
    const drop: Entity | undefined = bot.nearestEntity(
      (e: any) => e.name === 'item' || e.objectType === 'Item'
    )
    if (!drop) return null
    const dist = bot.entity?.position?.distanceTo((drop as any).position) ?? Infinity
    if (dist > radius) return null
    try {
      await bot.goto((drop as any).position, { range: 0.5 })
    } catch { /* дроп мог исчезнуть/подобраться другим */ }
    return drop
  }

  /**
   * Передать предметы игроку: подходим вплотную и выбрасываем предметы ему под ноги.
   * Универсально для любого режима: трейдов нет, а отдать надо — так отдают все.
   */
  bot.give = async (playerName: string, itemName: string, count = 1): Promise<void> => {
    const player = bot.players[playerName]
    if (!player?.entity) throw new Error(`Player ${playerName} not found (online and visible?)`)
    if (!bot.has(itemName, count)) {
      const id = getItemId(bot, itemName)
      if (id === null) throw new Error(`Unknown item: ${itemName}`)
      throw new Error(`Not enough ${itemName}: need ${count}`)
    }
    try {
      await bot.goto(player.entity.position, { range: 2 })
    } catch { /* кидаем откуда есть */ }
    await bot.lookAt(player.entity.position)
    await bot.toss(itemName, count)
  }

  // ---------- ВЫНОСИВОСТЬ (анархия / АФК-фермы) ----------

  /** Разовый прыжок (в майнфлеере это 3 строки контролов, тут — одна). */
  bot.jump = (): void => {
    bot.setControlState('jump', true)
    setTimeout(() => bot.setControlState('jump', false), 300)
  }

  /**
   * Анти-АФК: периодически прыгаем/приседаем/вертим головой, чтобы сервер не кикнул.
   * Останавливается через bot.stop().
   */
  bot.antiAfk = (intervalMs = 30_000): void => {
    if (bot._antiAfk) clearInterval(bot._antiAfk)
    bot._antiAfk = setInterval(() => {
      if (!bot.entity) return
      const roll = Math.floor(Math.random() * 3)
      if (roll === 0) {
        bot.jump()
      } else if (roll === 1) {
        bot.setControlState('sneak', true)
        setTimeout(() => bot.setControlState('sneak', false), 400)
      } else {
        const yaw = Math.random() * Math.PI * 2
        bot.look(Math.PI / 3, yaw).catch(() => {})
      }
    }, intervalMs)
  }
}
