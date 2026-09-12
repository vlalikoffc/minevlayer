import { getItemId, findBlocksForName, sleepMs } from './helpers'
import type { Block } from 'prismarine-block'

/**
 * Жизнь: базовые потребности бота одной строкой.
 * Философия та же, что у копания: действие = строка, невозможное — понятный отказ.
 *
 *   await bot.feed()              // поесть (сам найдёт еду в инвентаре)
 *   await bot.heal()              // наесться до полного голода, чтобы началось восстановление
 *   await bot.sleepNow()          // найти кровать, дойти, лечь спать
 *   await bot.craftChain('iron_pickaxe')  // скрафтить с автокрафтом недостающих ингредиентов
 */

/** Сколько раз максимум крутим цикл еды в heal(), чтобы не зависнуть. */
const HEAL_MAX_EATS = 40

function foodPointsOf(bot: any, item: any): number {
  // foodPoints есть в данных игры (только у съедобного)
  let data: any
  try { data = bot.registry?.itemsById?.[item.type] } catch {}
  if (!data) {
    try { data = require('minecraft-data')(bot.version).itemsById[item.type] } catch {}
  }
  return data?.foodPoints ?? 0
}

/** Еда в инвентаре, отсортирована от дешёвой к ценной (сначала едим что попроще). */
function findFood(bot: any): any[] {
  return bot.inventory.items()
    .filter((i: any) => {
      // сырое мясо тоже еда, но его лучше пожарить — всё равно считаем, выбор за ботом
      return foodPointsOf(bot, i) > 0
    })
    .sort((a: any, b: any) => foodPointsOf(bot, a) - foodPointsOf(bot, b))
}

export function injectLife(bot: any) {
  // ---------- ЕДА ----------
  bot.feed = async (): Promise<string | null> => {
    if ((bot.food ?? 20) >= 20) return null // уже сыт
    const food = findFood(bot)
    if (food.length === 0) {
      throw new Error('No food in inventory. Tip: kill animals, harvest crops, or give the bot food.')
    }
    const item = food[0]
    await bot.equip(item, 'hand')
    await bot.consume()
    return item.name ?? `#${item.type}`
  }

  bot.heal = async (): Promise<void> => {
    // едим, пока голод не станет полным — дальше здоровье восстановится само
    let eats = 0
    while ((bot.food ?? 0) < 20 && eats < HEAL_MAX_EATS) {
      const before = bot.food ?? 0
      const eaten = await bot.feed()
      eats++
      if (!eaten) return
      await sleepMs(100)
      if ((bot.food ?? 0) <= before) return // еда не прибавила голод (например, сервер не ответил) — выходим
    }
  }

  // ---------- СОН ----------
  bot.sleepNow = async (): Promise<void> => {
    const beds = bot.findBlocks({
      matching: (b: Block) => (typeof bot.isABed === 'function' ? bot.isABed(b) : String(b.name).includes('bed')),
      maxDistance: 32,
      count: 1
    })
    if (!beds || beds.length === 0) {
      throw new Error('No bed found within 32 blocks. Tip: craft a bed (3 wool + 3 planks) and place it.')
    }
    const bed = bot.blockAt(beds[0])
    if (!bed) throw new Error('Bed block disappeared while walking to it')
    try {
      await bot.goto(bed.position, { range: 2 })
    } catch { /* попробуем лечь с текущего места */ }
    try {
      await bot.sleep(bed)
    } catch (e) {
      throw new Error(
        `Cannot sleep: ${(e as Error).message}. Tip: sleeping works at night, in a safe place, in an unoccupied bed.`
      )
    }
  }

  // ---------- КРАФТ С ЦЕПОЧКОЙ ----------
  // 'железная кирка' -> нет досок -> крафтим доски из брёвен -> крафтим палки -> крафтим кирку
  bot.craftChain = async (itemName: string, count = 1, options: { table?: Block | 'auto' | false } = {}): Promise<void> => {
    const targetId = getItemId(bot, itemName)
    if (targetId === null) throw new Error(`Unknown item: ${itemName}`)

    const ctx: { table: Block | null | undefined } = { table: options.table === false ? null : undefined }
    const visited = new Set<string>()

    const nameOf = (id: number): string => {
      let n: string | undefined
      try { n = bot.registry?.itemsById?.[id]?.name } catch {}
      return n ?? `#${id}`
    }

    const countInInventory = (id: number): number =>
      bot.inventory.items()
        .filter((i: any) => i.type === id)
        .reduce((acc: number, i: any) => acc + i.count, 0)

    const findRecipe = (id: number): any => {
      // сначала пробуем без верстака (2x2)
      let recipes = bot.recipesFor(id, null, 1, null)
      if (recipes && recipes.length > 0) return recipes[0]
      if (ctx.table === null) return null // верстака нет (или запретили его искать)
      // нужен верстак: ищем ближайший, идём к нему
      if (ctx.table === undefined) {
        ctx.table = bot.findNearest ? bot.findNearest('crafting_table', 32) : null
        if (!ctx.table) {
          const positions: any[] = findBlocksForName(bot, 'crafting_table', 32, 1)
          ctx.table = positions.length > 0 ? bot.blockAt(positions[0]) : null
        }
        if (ctx.table) {
          try { bot.goto(ctx.table.position, { range: 3 }) } catch { /* докрафтимся как стоим */ }
        }
      }
      if (!ctx.table) return null
      recipes = bot.recipesFor(id, null, 1, ctx.table)
      return recipes && recipes.length > 0 ? recipes[0] : null
    }

    const craftRecursive = async (id: number, needed: number): Promise<void> => {
      if (needed <= 0) return
      const have = countInInventory(id)
      if (have >= needed) return

      const key = `${id}`
      if (visited.has(key)) {
        throw new Error(`Cannot craft chain for ${nameOf(id)}: recipe requires itself`)
      }
      visited.add(key)
      try {
        const remaining = needed - have
        const recipe = findRecipe(id)
        if (!recipe) {
          throw new Error(
            `Don't know how to get ${nameOf(id)}: no available recipe (missing ingredients or crafting table). ` +
            'Tip: gather the ingredients first.'
          )
        }
        const perCraft = recipe.result?.count ?? 1
        const times = Math.ceil(remaining / perCraft)

        // сначала докрафтим недостающие ингредиенты рецепта
        const need: { [id: number]: number } = {}
        for (const row of recipe.inShape || []) {
          for (const cell of row) {
            if (!cell || cell.id === undefined || cell.id === null) continue
            need[cell.id] = (need[cell.id] || 0) + (cell.count || 1) * times
          }
        }
        for (const [ingId, ingCount] of Object.entries(need)) {
          await craftRecursive(Number(ingId), ingCount)
        }

        await bot.craft(recipe, times, ctx.table ?? undefined)
      } finally {
        visited.delete(key)
      }
    }

    await craftRecursive(targetId, count)
  }
}
