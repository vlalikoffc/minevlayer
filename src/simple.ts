import { Vec3 } from 'vec3'
import type { MinevlayerBot, BreakOptions, GotoOptions, FollowOptions, PlaceOptions, CollectOptions } from './types'
import { getBlockId, getItemId, findBestTool, toVec3, isEntity, findBlocksForName, sleepMs } from './helpers'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'

export function injectSimple(bot: MinevlayerBot) {
  // ---------- FIND ----------
  bot.findNearest = (blockName: string, maxDistance = 64) => {
    const positions = findBlocksForName(bot, blockName, maxDistance, 1)
    if (positions.length === 0) return null
    const pos = positions[0]
    return bot.blockAt(pos)
  }

  bot.findAll = (blockName: string, maxDistance = 64, count = 10) => {
    return findBlocksForName(bot, blockName, maxDistance, count)
  }

  // ---------- EQUIP ----------
  bot.equipBest = async (blockOrItem?: string | Block) => {
    let block: Block | null = null
    if (typeof blockOrItem === 'string') {
      // ищем блок по имени в мире чтобы понять какой инструмент нужен
      block = bot.findNearest(blockOrItem, 4)
      if (!block) {
        // если блока рядом нет, просто пробуем экипировать предмет по имени
        const itemId = getItemId(bot, blockOrItem)
        if (itemId !== null) {
          const item = bot.inventory.items().find(i => i.type === itemId)
          if (item) {
            await bot.equip(item, 'hand')
            return
          }
        }
        return
      }
    } else if (blockOrItem && typeof blockOrItem === 'object' && 'type' in blockOrItem) {
      block = blockOrItem as Block
    }

    if (block) {
      const bestSlot = findBestTool(bot, block)
      if (bestSlot !== null) {
        const item = bot.inventory.slots[bestSlot]
        if (item) {
          try { await bot.equip(item, 'hand') } catch {}
        }
      }
    } else {
      // без блока — просто берём первый инструмент
      const item = bot.inventory.items()[0]
      if (item) try { await bot.equip(item, 'hand') } catch {}
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

  ;(bot as any).toss = async (itemName: string, count?: number) => {
    const id = getItemId(bot, itemName)
    if (id === null) throw new Error(`Unknown item: ${itemName}`)
    const item = bot.inventory.items().find(i => i.type === id)
    if (!item) throw new Error(`No ${itemName} in inventory`)
    if (count === undefined) {
      await bot.tossStack(item)
    } else {
      // выбрасываем по частям
      let remaining = count
      const stacks = bot.inventory.items().filter(i => i.type === id)
      for (const stack of stacks) {
        if (remaining <= 0) break
        const toToss = Math.min(stack.count, remaining)
        // вызываем оригинальный toss с числовыми аргументами через any чтобы обойти перегрузку
        await (bot as any).toss(stack.type, null, toToss)
        remaining -= toToss
      }
    }
  }

  // ---------- GOTO ----------
  bot.goto = async (target: any, options: GotoOptions = {}): Promise<void> => {
    const range = options.range ?? 1
    let pos: Vec3

    if (typeof target === 'string') {
      // "player:Notch" или просто "Notch" или "100 64 200"
      if (target.includes(' ')) {
        const parts = target.split(/\s+/).map(Number)
        pos = new Vec3(parts[0], parts[1], parts[2])
      } else if (target.startsWith('player:')) {
        const name = target.slice(7)
        const player = bot.players[name]
        if (!player?.entity) throw new Error(`Player ${name} not found`)
        pos = player.entity.position.clone()
      } else {
        // пробуем как ник игрока
        const player = bot.players[target]
        if (player?.entity) {
          pos = player.entity.position.clone()
        } else {
          // пробуем как имя блока — идём к ближайшему блоку
          const block = bot.findNearest(target, 64)
          if (!block) throw new Error(`Cannot resolve goto target: ${target}`)
          pos = block.position.clone()
        }
      }
    } else if (isEntity(target)) {
      pos = (target as Entity).position.clone()
    } else {
      pos = toVec3(target)
    }

    // если есть pathfinder — используем его
    const anyBot: any = bot
    if (anyBot.pathfinder) {
      const { goals } = require('mineflayer-pathfinder')
      const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range)
      // таймаут
      const timeoutMs = options.timeoutMs ?? 30_000
      return await Promise.race([
        anyBot.pathfinder.goto(goal),
        sleepMs(timeoutMs).then(() => { throw new Error(`goto timeout to ${pos}`) })
      ])
    }

    // fallback: пробуем через простую физику
    // если креатив — летим
    if (bot.game.gameMode === 'creative' && bot.creative?.flyTo) {
      try {
        await bot.creative.flyTo(pos.offset(0.5, 0, 0.5))
        return
      } catch {}
    }

    // иначе — наивная ходьба: смотрим на цель и идём
    // Это примитив, но работает на ровной местности. Для сложного — нужен pathfinder.
    const distance = bot.entity.position.distanceTo(pos)
    if (distance <= range) return

    // пытаемся идти прямо
    await bot.lookAt(pos.offset(0.5, 1, 0.5))
    bot.setControlState('forward', true)
    if (options.sprint) bot.setControlState('sprint', true)

    const start = Date.now()
    const timeout = options.timeoutMs ?? 15000

    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        const dist = bot.entity.position.distanceTo(pos)
        if (dist <= range) {
          clearInterval(interval)
          bot.clearControlStates()
          resolve()
        }
        if (Date.now() - start > timeout) {
          clearInterval(interval)
          bot.clearControlStates()
          reject(new Error(`goto timeout: still ${dist.toFixed(1)} blocks away from ${pos}. Tip: install mineflayer-pathfinder for smart navigation`))
        }
        // прыжок если упёрлись
        if (bot.entity.onGround && bot.blockAt(bot.entity.position.offset(0, -0.1, 0))) {
          // auto jump handled by physics?
        }
      }, 100)
      // также прыгаем при препятствии
      const jumpCheck = setInterval(() => {
        const front = bot.entity.position.offset(
          Math.cos((bot.entity.yaw + Math.PI) * -1) * 0.5,
          0,
          Math.sin((bot.entity.yaw + Math.PI) * -1) * 0.5
        )
        const blockAhead = bot.blockAt(front.offset(0, 0, 0))
        const blockAbove = bot.blockAt(front.offset(0, 1, 0))
        if (blockAhead && blockAhead.boundingBox === 'block' && (!blockAbove || blockAbove.boundingBox !== 'block')) {
          bot.setControlState('jump', true)
          setTimeout(() => bot.setControlState('jump', false), 300)
        }
      }, 400)
      // cleanup on finish
      const cleanup = () => { clearInterval(jumpCheck) }
      // wrap resolve/reject to cleanup
      const origResolve = resolve
      const origReject = reject
      // monkey patch via closure — easier: just clear on both
      // we handle above, but also clear jumpCheck there
    })

    bot.clearControlStates()
  }

  bot.follow = async (target: string | Entity, options: FollowOptions = {}) => {
    const distance = options.distance ?? 2
    const entity: Entity | undefined = typeof target === 'string'
      ? bot.players[target]?.entity || bot.nearestEntity(e => (e as any).username === target || e.name === target) || undefined
      : target as Entity

    if (!entity) throw new Error(`follow target not found: ${target}`)

    if ((bot as any).pathfinder) {
      const { goals } = require('mineflayer-pathfinder')
      const anyBot: any = bot
      // если continuous — ставим goal динамически
      if (options.continuous !== false) {
        const follow = () => {
          const goal = new goals.GoalFollow(entity, distance)
          anyBot.pathfinder.setGoal(goal, true)
        }
        follow()
        // обновляем каждые 0.5с
        const iv = setInterval(() => {
          if (!entity.isValid) { clearInterval(iv); return }
          follow()
        }, 500)
        // остановить следование можно через bot.stop()
        ;(bot as any)._followInterval = iv
        return
      } else {
        const goal = new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, distance)
        await anyBot.pathfinder.goto(goal)
        return
      }
    }

    // fallback без pathfinder
    await bot.goto(entity.position, { range: distance })
  }

  bot.stop = () => {
    const anyBot: any = bot
    if (anyBot.pathfinder) {
      try { anyBot.pathfinder.setGoal(null) } catch {}
    }
    if (anyBot._followInterval) {
      clearInterval(anyBot._followInterval)
      anyBot._followInterval = null
    }
    bot.clearControlStates()
    try { bot.stopDigging() } catch {}
  }

  // ---------- BREAK / MINE ----------
  async function breakOne(blockName: string, options: BreakOptions = {}): Promise<void> {
    const maxDistance = options.maxDistance ?? 64
    const autoTool = options.autoTool ?? true

    const block = bot.findNearest(blockName, maxDistance)
    if (!block) throw new Error(`Block not found: ${blockName} within ${maxDistance} blocks. Try coming closer or increasing maxDistance`)

    // идём к блоку если далеко
    const dist = bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5))
    if (dist > 4.5) {
      try {
        await bot.goto(block.position, { range: 3 })
      } catch (e) {
        // если не дошли — пробуем всё равно копать, может в зоне досягаемости
        bot.chat(`Не могу дойти до ${blockName} (${(e as Error).message}), пробую копать отсюда...`)
      }
    }

    if (autoTool) {
      try { await bot.equipBest(block) } catch {}
    }

    // проверяем можно ли копать
    if (!bot.canDigBlock(block)) {
      // пробуем посмотреть на блок
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
      if (count > 1) await sleepMs(200) // чуть подождать между блоками
    }
  }

  bot.mine = async (blockName: string, count = 1, options: BreakOptions = {}): Promise<void> => {
    await bot.break(blockName, { ...options, count })
  }

  bot.collect = async (blockName: string, count = 1, options: CollectOptions = {}): Promise<void> => {
    // если есть mineflayer-collectblock — используем его для умного сбора
    const anyBot: any = bot
    if (anyBot.collectBlock) {
      const id = getBlockId(bot, blockName)
      if (id !== null) {
        const mcData = require('minecraft-data')(bot.version)
        const block = mcData.blocksById[id]
        // collectBlock api: bot.collectBlock.collect(block, { count })
        try {
          // пробуем современный API
          if (anyBot.collectBlock.collect) {
            await anyBot.collectBlock.collect(block, { count })
            return
          }
        } catch {}
      }
    }
    // fallback — просто ломаем
    await bot.mine(blockName, count, options)
    // подождать пока дроп подберётся
    await sleepMs(500)
  }

  // ---------- PLACE ----------
  bot.place = async (blockName: string, reference?: Block | Vec3, options: PlaceOptions = {}): Promise<void> => {
    const autoEquip = options.autoEquip ?? true
    if (autoEquip) {
      try { await bot.equipBest(blockName) } catch {}
    }

    // найти предмет в инвентаре
    const itemId = getItemId(bot, blockName)
    if (itemId === null) throw new Error(`Unknown block/item: ${blockName}`)
    const hasItem = bot.inventory.items().some(i => i.type === itemId)
    if (!hasItem) throw new Error(`No ${blockName} in inventory`)

    let refBlock: Block
    let face = options.face ?? new Vec3(0, 1, 0)

    if (!reference) {
      // ставим перед собой на землю
      const pos = bot.entity.position.offset(0, -1, 0).floored()
      const b = bot.blockAt(pos)
      if (!b) throw new Error('No reference block found beneath feet')
      refBlock = b
    } else if ((reference as Block).position) {
      refBlock = reference as Block
    } else {
      const vec = toVec3(reference)
      const b = bot.blockAt(vec)
      if (!b) throw new Error(`No block at reference ${vec}`)
      refBlock = b
    }

    // если есть genericPlace — используем
    try {
      await bot.placeBlock(refBlock, face)
    } catch (e) {
      // пробуем соседние грани
      const faces = [new Vec3(0, 1, 0), new Vec3(0, -1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)]
      let lastErr = e
      for (const f of faces) {
        try {
          await bot.placeBlock(refBlock, f)
          return
        } catch (err) { lastErr = err }
      }
      throw lastErr
    }
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
    // если есть mineflayer-auto-eat
    const anyBot: any = bot
    if (anyBot.autoEat) {
      anyBot.autoEat.enable()
      return
    }
    // простой фолбэк
    bot.on('health', async () => {
      if (bot.food < 15) {
        const food = bot.inventory.items().find(i => i.name.includes('bread') || i.name.includes('cooked') || i.name.includes('apple'))
        if (food) {
          try { await bot.equip(food, 'hand'); await bot.consume() } catch {}
        }
      }
    })
  }

  bot.guard = (position: Vec3 | { x: number, y: number, z: number }, radius = 15) => {
    const pos = toVec3(position)
    const anyBot: any = bot
    if (anyBot.pvp) {
      // используем pvp плагин если есть
      bot.on('physicsTick', () => {
        const target = bot.nearestEntity(e => e.type === 'mob' && e.position.distanceTo(pos) < radius)
        if (target) {
          try { anyBot.pvp.attack(target) } catch {}
        }
      })
      return
    }
    // фолбэк: просто атакуем ближайшую сущность
    bot.on('physicsTick', () => {
      const target = bot.nearestEntity(e => e.type === 'mob' && bot.entity.position.distanceTo(e.position) < radius)
      if (target) bot.attack(target)
    })
  }

  bot.craftSimple = async (itemName: string, count = 1, craftingTable?: Block | boolean) => {
    const itemId = getItemId(bot, itemName)
    if (itemId === null) throw new Error(`Unknown item: ${itemName}`)
    const recipes = bot.recipesFor(itemId, null, 1, craftingTable as any)
    if (!recipes || recipes.length === 0) throw new Error(`No recipe for ${itemName}${craftingTable ? '' : ' (try near crafting table)'}`)
    await bot.craft(recipes[0], count, craftingTable as any)
  }

  bot.build = async (_structure: string, _options?: any) => {
    throw new Error('bot.build() not yet implemented — coming soon! Use bot.place() for now')
  }
}
