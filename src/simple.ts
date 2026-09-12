import { Vec3 } from 'vec3'
import type { MinevlayerBot, BreakOptions, GotoOptions, FollowOptions, PlaceOptions, CollectOptions } from './types'
import { getBlockId, getItemId, findBestTool, getHarvestTools, toVec3, isEntity, findBlocksForName, sleepMs, withTimeout } from './helpers'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'

/**
 * Инжектим простые методы в обычного mineflayer-бота.
 * Правило: 1 действие = 1 строка. Всё «умное» (поиск, подход, инструмент) — внутри.
 */
export function injectSimple(bot: MinevlayerBot) {
  const anyBot: any = bot

  // ---------- FIND ----------
  bot.findNearest = (blockName: string, maxDistance = 64) => {
    const positions = findBlocksForName(bot, blockName, maxDistance, 1)
    if (positions.length === 0) return null
    return bot.blockAt(positions[0])
  }

  bot.findAll = (blockName: string, maxDistance = 64, count = 10) => {
    return findBlocksForName(bot, blockName, maxDistance, count)
  }

  // ---------- EQUIP ----------
  bot.equipBest = async (blockOrItem?: string | Block) => {
    let block: Block | null = null
    if (typeof blockOrItem === 'string') {
      // ищем блок рядом, чтобы понять, какой инструмент нужен
      block = bot.findNearest(blockOrItem, 4)
      if (!block) {
        // блока рядом нет — просто берём предмет по имени
        const itemId = getItemId(bot, blockOrItem)
        if (itemId !== null) {
          const item = bot.inventory.items().find(i => i.type === itemId)
          if (item) await bot.equip(item, 'hand')
        }
        return
      }
    } else if (blockOrItem && typeof blockOrItem === 'object' && 'type' in blockOrItem) {
      block = blockOrItem as Block
    }

    if (block) {
      // если блок требует конкретный инструмент (кирка для руды) — ищем среди подходящих
      const harvest = getHarvestTools(bot, block.name)
      const bestSlot = findBestTool(bot, block, harvest?.ids ?? null)
        ?? (harvest ? null : findBestTool(bot, block))
      if (bestSlot !== null) {
        const item = bot.inventory.slots[bestSlot]
        if (item) {
          try { await bot.equip(item, 'hand') } catch { /* мог забрать другой плагин */ }
        }
      }
    }
  }

  bot.has = (itemName: string, count = 1) => {
    const id = getItemId(bot, itemName)
    if (id === null) return false
    const total = bot.inventory.items()
      .filter(i => i.type === id)
      .reduce((acc, i) => acc + i.count, 0)
    return total >= count
  }

  // ВАЖНО: сохраняем оригинальный toss ДО переопределения,
  // иначе было бы бесконечная рекурсия (метод зовёт сам себя).
  const originalToss = anyBot.toss
  ;(bot as any).toss = async (itemName: string, count?: number) => {
    const id = getItemId(bot, itemName)
    if (id === null) throw new Error(`Unknown item: ${itemName}`)
    const stacks = bot.inventory.items().filter(i => i.type === id)
    if (stacks.length === 0) throw new Error(`No ${itemName} in inventory`)
    if (count === undefined) {
      await bot.tossStack(stacks[0])
      return
    }
    let remaining = count
    for (const stack of stacks) {
      if (remaining <= 0) break
      const toToss = Math.min(stack.count, remaining)
      await originalToss.call(bot, stack.type, null, toToss)
      remaining -= toToss
    }
    if (remaining > 0) throw new Error(`Had only ${count - remaining} ${itemName}, wanted to toss ${count}`)
  }

  // ---------- GOTO ----------
  bot.goto = async (target: any, options: GotoOptions = {}): Promise<void> => {
    const range = options.range ?? 1
    let pos: Vec3

    if (typeof target === 'string') {
      if (/\s/.test(target.trim()) || /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){2}$/.test(target.trim())) {
        // "100 64 200" или "100,64,200"
        const parts = target.trim().split(/[\s,]+/).map(Number)
        if (parts.length !== 3 || parts.some(isNaN)) throw new Error(`Cannot parse coordinates: "${target}"`)
        pos = new Vec3(parts[0], parts[1], parts[2])
      } else if (target.startsWith('player:')) {
        const name = target.slice('player:'.length)
        const player = bot.players[name]
        if (!player?.entity) throw new Error(`Player ${name} not found`)
        pos = player.entity.position.clone()
      } else {
        // сначала пробуем как ник игрока
        const player = bot.players[target]
        if (player?.entity) {
          pos = player.entity.position.clone()
        } else {
          // потом как имя блока — идём к ближайшему
          const block = bot.findNearest(target, 64)
          if (!block) throw new Error(`Cannot resolve goto target: "${target}" (not a player, not a known block nearby)`)
          pos = block.position.clone()
        }
      }
    } else if (isEntity(target)) {
      pos = (target as Entity).position.clone()
    } else {
      pos = toVec3(target)
    }

    // уже на месте — не дёргаем физику
    if (bot.entity && bot.entity.position.distanceTo(pos) <= range) return

    // если есть pathfinder — используем его (умная навигация)
    if (anyBot.pathfinder) {
      const timeoutMs = options.timeoutMs ?? 30_000
      let goal: any
      try {
        const { goals } = require('mineflayer-pathfinder')
        goal = new goals.GoalNear(pos.x, pos.y, pos.z, range)
      } catch {
        // pathfinder загружен, но модуль не резолвится — строим минимальную цель сами
        goal = { x: pos.x, y: pos.y, z: pos.z, range }
      }
      await withTimeout(anyBot.pathfinder.goto(goal), timeoutMs, `goto timeout: cannot reach ${pos} in ${timeoutMs}ms`)
      return
    }

    // креатив — просто летим
    if (bot.game?.gameMode === 'creative' && (bot as any).creative?.flyTo) {
      try {
        await (bot as any).creative.flyTo(pos.offset(0.5, 0, 0.5))
        return
      } catch { /* падаем в наивную ходьбу */ }
    }

    // наивная ходьба: смотрим на цель и идём вперёд, прыгаем в препятствия.
    // Для сложной местности поставьте mineflayer-pathfinder.
    await bot.lookAt(pos.offset(0.5, 1, 0.5))
    bot.setControlState('forward', true)
    if (options.sprint) bot.setControlState('sprint', true)

    const start = Date.now()
    const timeout = options.timeoutMs ?? 15_000

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        if (settled) return
        settled = true
        clearInterval(walkTimer)
        clearInterval(jumpTimer)
        bot.clearControlStates()
      }

      const walkTimer = setInterval(() => {
        // в откате (после урона/откидывания) не жмём кнопки — физика сама разберётся
        if ((anyBot._kbUntil ?? 0) > Date.now()) return
        const dist = bot.entity.position.distanceTo(pos)
        if (dist <= range) {
          cleanup()
          resolve()
          return
        }
        if (Date.now() - start > timeout) {
          cleanup()
          reject(new Error(`goto timeout: still ${dist.toFixed(1)} blocks away from ${pos}. Tip: install mineflayer-pathfinder for smart navigation`))
        }
      }, 100)

      let diggingWall = false
      const jumpTimer = setInterval(() => {
        const yaw = bot.entity.yaw ?? 0
        const front = bot.entity.position.offset(
          Math.cos((yaw + Math.PI) * -1) * 0.5,
          0,
          Math.sin((yaw + Math.PI) * -1) * 0.5
        )
        const blockAhead = bot.blockAt(front)
        const blockAbove = bot.blockAt(front.offset(0, 1, 0))
        if (blockAhead && blockAhead.boundingBox === 'block') {
          if (!blockAbove || blockAbove.boundingBox !== 'block') {
            // ступенька в 1 блок — прыгаем
            bot.setControlState('jump', true)
            setTimeout(() => bot.setControlState('jump', false), 300)
          } else if (!diggingWall && !bot.targetDigBlock && blockAhead.diggable !== false) {
            // стена в 2 блока — ломаем нижний блок и идём дальше
            // (с установленным mineflayer-pathfinder препятствия обходятся и так — умнее)
            diggingWall = true
            bot.dig(blockAhead)
              .catch(() => {})
              .finally(() => { diggingWall = false })
          }
        }
      }, 400)
    })
  }

  // ---------- FOLLOW ----------
  bot.follow = async (target: string | Entity, options: FollowOptions = {}) => {
    const distance = options.distance ?? 2
    const continuous = options.continuous !== false
    const entity: Entity | undefined = typeof target === 'string'
      ? bot.players[target]?.entity || bot.nearestEntity(e => (e as any).username === target || e.name === target) || undefined
      : target as Entity

    if (!entity) throw new Error(`follow target not found: ${target}`)

    const stopFollow = () => {
      if (anyBot._followInterval) {
        clearInterval(anyBot._followInterval)
        anyBot._followInterval = null
      }
    }
    stopFollow() // одно следование за раз

    if (anyBot.pathfinder) {
      try {
        const { goals } = require('mineflayer-pathfinder')
        if (!continuous) {
          await anyBot.pathfinder.goto(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, distance))
          return
        }
        anyBot.pathfinder.setGoal(new goals.GoalFollow(entity, distance), true)
        anyBot._followInterval = setInterval(() => {
          if (!entity.isValid) { stopFollow(); return }
          anyBot.pathfinder.setGoal(new goals.GoalFollow(entity, distance), true)
        }, 500)
        return
      } catch {
        // нет модуля целей — падаем в наивный режим ниже
      }
    }

    // наивный режим: постоянно поворачиваемся к цели и идём, пока не остановят через bot.stop()
    if (!continuous) {
      await bot.goto(entity.position, { range: distance })
      return
    }
    anyBot._followInterval = setInterval(() => {
      if (!entity.isValid || !bot.entity) { stopFollow(); return }
      const dist = bot.entity.position.distanceTo(entity.position)
      if (dist > distance) {
        bot.lookAt(entity.position).catch(() => {})
        bot.setControlState('forward', true)
      } else {
        bot.clearControlStates()
      }
    }, 250)
  }

  bot.stop = () => {
    if (anyBot.pathfinder) {
      try { anyBot.pathfinder.setGoal(null) } catch {}
    }
    if (anyBot._followInterval) {
      clearInterval(anyBot._followInterval)
      anyBot._followInterval = null
    }
    if (anyBot._antiAfk) {
      clearInterval(anyBot._antiAfk)
      anyBot._antiAfk = null
    }
    if (anyBot._fight) {
      anyBot._fight.active = false
    }
    if (anyBot._guardHandler) {
      bot.removeListener('physicsTick', anyBot._guardHandler)
      anyBot._guardHandler = null
    }
    bot.clearControlStates()
    try { bot.stopDigging() } catch {}
  }

  // ---------- BREAK / MINE ----------
  async function breakOne(blockName: string, options: BreakOptions = {}): Promise<void> {
    const maxDistance = options.maxDistance ?? 64
    const autoTool = options.autoTool ?? true

    // Проверяем инструмент ДО того, как куда-то идти.
    // Если блок даёт дроп только конкретной киркой (алмазная руда — железная+),
    // а такой в инвентаре нет — отказываемся сразу и объясняем чем именно.
    const harvest = getHarvestTools(bot, blockName)
    if (harvest && !options.force) {
      const suitable = bot.inventory.items().filter(i => harvest.ids.includes(i.type))
      if (suitable.length === 0) {
        const itemName = (i: any) => i.name ?? (bot.registry as any)?.itemsById?.[i.type]?.name ?? `#${i.type}`
        const have = [...new Set(bot.inventory.items().map(itemName))]
        throw new Error(
          `Refusing to mine ${blockName}: no suitable tool in inventory. ` +
          `Need one of: ${harvest.names.join(', ')}. ` +
          `Inventory has: ${have.length ? have.join(', ') : '(empty)'}. ` +
          'Tip: craft/get the tool first, or pass { force: true } to dig anyway (block breaks but drops NOTHING).'
        )
      }
    }

    const block = bot.findNearest(blockName, maxDistance)
    if (!block) throw new Error(`Block not found: ${blockName} within ${maxDistance} blocks. Try coming closer or increasing maxDistance`)

    // идём к блоку, если далеко; если не дошли — пробуем копать отсюда (вдруг уже в зоне досягаемости)
    const dist = bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5))
    if (dist > 4.5) {
      try {
        await bot.goto(block.position, { range: 3, timeoutMs: options.timeoutMs })
      } catch { /* попробуем докопать с текущей точки */ }
    }

    if (autoTool) {
      try { await bot.equipBest(block) } catch {}
    }

    if (!bot.canDigBlock(block)) {
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5))
      if (!bot.canDigBlock(block)) {
        throw new Error(`Cannot dig ${blockName} at ${block.position} — out of reach or undiggable`)
      }
    }

    await bot.dig(block)
  }

  bot.break = async (blockName: string, options: BreakOptions = {}): Promise<void> => {
    const count = options.count ?? 1
    for (let i = 0; i < count; i++) {
      await breakOne(blockName, { ...options, count: undefined })
      if (count > 1) await sleepMs(200) // пауза между блоками, чтобы сервер успевал
    }
  }

  bot.mine = async (blockName: string, count = 1, options: BreakOptions = {}): Promise<void> => {
    await bot.break(blockName, { ...options, count })
  }

  // bot.dig('diamond_ore') — как в мечте: имя блока вместо 50 строк майнфлеера.
  // Для совместимости со старым API: если передали объект Block — зовём оригинальный dig.
  const originalDig = anyBot.dig
  ;(bot as any).dig = async (blockOrName: any, force?: boolean) => {
    if (typeof blockOrName === 'string') return bot.break(blockOrName)
    return originalDig.call(bot, blockOrName, force)
  }

  bot.collect = async (blockName: string, count = 1, options: CollectOptions = {}): Promise<void> => {
    // если установлен mineflayer-collectblock — он сам дойдёт, сломает и подберёт дроп
    if (anyBot.collectBlock) {
      const positions = findBlocksForName(bot, blockName, options.maxDistance ?? 64, count)
      const blocks: Block[] = []
      for (const p of positions) {
        const b = bot.blockAt(p)
        if (b) blocks.push(b)
      }
      if (blocks.length > 0) {
        try {
          // collectBlock принимает настоящий Block или массив блоков
          await anyBot.collectBlock.collect(blocks)
          return
        } catch { /* падаем в обычный режим */ }
      }
    }
    await bot.mine(blockName, count, options)
    await sleepMs(500) // подождать, пока дроп подберётся
  }

  // ---------- PLACE ----------
  bot.place = async (blockName: string, reference?: Block | Vec3 | { x: number, y: number, z: number }, options: PlaceOptions = {}): Promise<void> => {
    if (options.autoEquip !== false) {
      try { await bot.equipBest(blockName) } catch {}
    }

    const itemId = getItemId(bot, blockName)
    if (itemId === null) throw new Error(`Unknown block/item: ${blockName}`)
    const hasItem = bot.inventory.items().some(i => i.type === itemId)
    if (!hasItem) throw new Error(`No ${blockName} in inventory`)

    let refBlock: Block
    if (!reference) {
      // ставим на блок под ногами
      const under = bot.blockAt(bot.entity.position.offset(0, -1, 0).floored())
      if (!under) throw new Error('No reference block found beneath feet')
      refBlock = under
    } else if ((reference as Block).position) {
      refBlock = reference as Block
    } else {
      const vec = toVec3(reference)
      const b = bot.blockAt(vec)
      if (!b) throw new Error(`No block at reference ${vec}`)
      refBlock = b
    }

    const faces = [
      options.face ?? new Vec3(0, 1, 0),
      new Vec3(0, 1, 0), new Vec3(0, -1, 0),
      new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1), new Vec3(0, 0, -1)
    ]
    let lastErr: unknown
    for (const face of faces) {
      try {
        await bot.placeBlock(refBlock, face)
        return
      } catch (err) { lastErr = err }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  // ---------- CHAT / UTILS ----------
  bot.onChat = (trigger: string | RegExp, callback: (username: string, message: string) => void) => {
    const handler = (username: string, message: string) => {
      if (username === bot.username) return
      const match = typeof trigger === 'string' ? message.includes(trigger) : trigger.test(message)
      if (match) callback(username, message)
    }
    bot.on('chat', handler)
  }

  bot.when = (event: string, callback: (...args: any[]) => void) => {
    bot.on(event as any, callback)
  }

  bot.wait = (ticks: number) => bot.waitForTicks(ticks)

  bot.say = (message: string, delayMs = 0) => {
    if (delayMs <= 0) bot.chat(message)
    else setTimeout(() => bot.chat(message), delayMs)
  }

  bot.autoEat = () => {
    if (anyBot.autoEat && typeof anyBot.autoEat.enable === 'function') {
      anyBot.autoEat.enable()
      return
    }
    // простой фолбэк: едим, когда голод < 15
    bot.on('health', async () => {
      if (bot.food < 15) {
        const food = bot.inventory.items().find(i =>
          i.name.includes('bread') || i.name.includes('cooked') || i.name.includes('apple'))
        if (food) {
          try { await bot.equip(food, 'hand'); await bot.consume() } catch {}
        }
      }
    })
  }

  bot.guard = (position: Vec3 | { x: number, y: number, z: number }, radius = 15) => {
    const pos = toVec3(position)
    if (anyBot._guardHandler) bot.removeListener('physicsTick', anyBot._guardHandler)
    const handler = () => {
      const target = bot.nearestEntity(e => e.type === 'mob' && e.position.distanceTo(pos) < radius)
      if (!target) return
      if (anyBot.pvp) {
        try {
          const p = anyBot.pvp.attack(target)
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch {}
      } else {
        bot.attack(target)
      }
    }
    anyBot._guardHandler = handler
    bot.on('physicsTick', handler)
  }

  bot.craftSimple = async (itemName: string, count = 1, craftingTable?: Block | boolean) => {
    const itemId = getItemId(bot, itemName)
    if (itemId === null) throw new Error(`Unknown item: ${itemName}`)
    const recipes = bot.recipesFor(itemId, null, 1, craftingTable as any)
    if (!recipes || recipes.length === 0) {
      throw new Error(`No recipe available for ${itemName}${craftingTable ? '' : ' (try passing a crafting table)'}`)
    }
    await bot.craft(recipes[0], count, craftingTable as any)
  }
}
