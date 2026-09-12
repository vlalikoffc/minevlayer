/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { Vec3 } = require('vec3')
const { injectSimple } = require('../../dist/simple')
const { injectLife } = require('../../dist/life')
const { createMockBot } = require('../mocks/bot')

function lifeBot (opts = {}) {
  const bot = createMockBot(opts)
  injectSimple(bot)
  injectLife(bot)
  return bot
}

describe('life: feed / heal', () => {
  const FOOD_REGISTRY = {
    itemsById: {
      297: { name: 'bread', foodPoints: 5 },
      364: { name: 'cooked_beef', foodPoints: 8 },
      257: { name: 'iron_pickaxe' }
    }
  }

  it('feed() eats the simplest food first and returns its name', async () => {
    const bot = lifeBot({
      food: 10,
      inventory: [
        { type: 364, count: 1, name: 'cooked_beef' },
        { type: 297, count: 2, name: 'bread' }
      ]
    })
    bot.registry = FOOD_REGISTRY
    const eaten = await bot.feed()
    assert.strictEqual(eaten, 'bread') // стейк приберегли
    assert.strictEqual(bot._calls.equip.length, 1)
  })

  it('feed() returns null when already full', async () => {
    const bot = lifeBot({ food: 20, inventory: [{ type: 297, count: 1, name: 'bread' }] })
    bot.registry = FOOD_REGISTRY
    assert.strictEqual(await bot.feed(), null)
  })

  it('feed() refuses without food', async () => {
    const bot = lifeBot({ food: 10, inventory: [{ type: 257, count: 1, name: 'iron_pickaxe' }] })
    bot.registry = FOOD_REGISTRY
    await assert.rejects(() => bot.feed(), /No food in inventory/)
  })

  it('heal() eats until hunger is full', async () => {
    const bot = lifeBot({
      food: 10,
      health: 8,
      inventory: [{ type: 297, count: 5, name: 'bread' }] // +5 голода за штуку (мок)
    })
    bot.registry = FOOD_REGISTRY
    await bot.heal()
    assert.strictEqual(bot.food, 20)
    assert.strictEqual(bot._calls.consume.length, 2) // 10 -> 15 -> 20
  })
})

describe('life: sleepNow', () => {
  const bedBlock = { position: new Vec3(2, 64, 0), name: 'red_bed' }

  it('walks to the nearest bed and sleeps', async () => {
    const bot = lifeBot({
      position: [2, 64, 0], // уже рядом с кроватью
      findBlocks: () => [new Vec3(2, 64, 0)],
      blockAt: () => bedBlock
    })
    await bot.sleepNow()
    assert.strictEqual(bot._calls.sleep.length, 1)
    assert.strictEqual(bot._calls.sleep[0], bedBlock)
  })

  it('refuses when there is no bed nearby', async () => {
    const bot = lifeBot({ findBlocks: () => [] })
    await assert.rejects(() => bot.sleepNow(), /No bed found/)
  })

  it('explains why sleeping failed', async () => {
    const bot = lifeBot({
      position: [2, 64, 0],
      findBlocks: () => [new Vec3(2, 64, 0)],
      blockAt: () => bedBlock,
      sleep: async () => { throw new Error('you can sleep only at night') }
    })
    await assert.rejects(() => bot.sleepNow(), /Cannot sleep: you can sleep only at night/)
  })
})

describe('life: craftChain', () => {
  // палки <- доски <- брёвна
  const STICK = 280
  const PLANKS = 5
  const LOG = 17
  const stickRecipe = { result: { id: STICK, count: 4 }, inShape: [[{ id: PLANKS, count: 1 }], [{ id: PLANKS, count: 1 }]] }
  const planksRecipe = { result: { id: PLANKS, count: 4 }, inShape: [[{ id: LOG, count: 1 }]] }
  const REGISTRY = {
    itemsByName: { stick: { id: STICK }, oak_planks: { id: PLANKS }, oak_log: { id: LOG } },
    itemsById: { [STICK]: { name: 'stick' }, [PLANKS]: { name: 'oak_planks' }, [LOG]: { name: 'oak_log' } }
  }

  function craftBot (inventory, extraRecipes = {}) {
    const recipes = { [STICK]: stickRecipe, [PLANKS]: planksRecipe, ...extraRecipes }
    const bot = lifeBot({
      position: [0, 64, 0],
      inventory,
      recipesFor: (id) => (recipes[id] ? [recipes[id]] : [])
    })
    bot.registry = REGISTRY
    return bot
  }

  it('does nothing when the item is already in inventory', async () => {
    const bot = craftBot([{ type: STICK, count: 8, name: 'stick' }])
    await bot.craftChain('stick', 4)
    assert.strictEqual(bot._calls.craft.length, 0)
  })

  it('crafts with available ingredients in one step', async () => {
    const bot = craftBot([{ type: PLANKS, count: 2, name: 'oak_planks' }])
    await bot.craftChain('stick', 4)
    assert.strictEqual(bot._calls.craft.length, 1)
    assert.strictEqual(bot._calls.craft[0][0], stickRecipe)
    assert.strictEqual(bot._calls.craft[0][1], 1) // 4 палки за 1 крафт
  })

  it('crafts the whole chain: logs -> planks -> sticks', async () => {
    const bot = craftBot([{ type: LOG, count: 1, name: 'oak_log' }])
    await bot.craftChain('stick', 4)
    assert.deepStrictEqual(
      bot._calls.craft.map(c => c[0].result.id),
      [PLANKS, STICK], // сначала доски, потом палки
      'chain order must be ingredients first'
    )
  })

  it('refuses with a clear message when the chain is impossible', async () => {
    const bot = craftBot([]) // ни брёвен, ни досок, ни верстака
    await assert.rejects(() => bot.craftChain('stick', 4), /Don't know how to get oak_log/)
  })

  it('uses a crafting table when the recipe requires one', async () => {
    const tableBlock = { position: new Vec3(1, 64, 1), name: 'crafting_table' }
    const chestRecipe = { result: { id: 54, count: 1 }, inShape: [[{ id: PLANKS, count: 1 }, { id: PLANKS, count: 1 }], [{ id: PLANKS, count: 1 }, { id: PLANKS, count: 1 }]] }
    const bot = lifeBot({
      position: [0, 64, 0],
      blocks: { crafting_table: { id: 58 } },
      inventory: [{ type: PLANKS, count: 8, name: 'oak_planks' }],
      findBlocks: (o) => {
        // верстак находится только если ищут его
        const probe = o.matching({ type: 58, name: 'crafting_table', displayName: 'Crafting Table' })
        return probe ? [new Vec3(1, 64, 1)] : []
      },
      blockAt: () => tableBlock,
      recipesFor: (id, meta, min, table) => {
        if (id === 54) return table ? [chestRecipe] : [] // без верстака нельзя
        return []
      }
    })
    bot.registry = {
      blocksByName: { crafting_table: { id: 58 } },
      itemsByName: { chest: { id: 54 } },
      itemsById: { 54: { name: 'chest' } }
    }
    await bot.craftChain('chest', 1)
    assert.strictEqual(bot._calls.craft.length, 1)
    assert.strictEqual(bot._calls.craft[0][2], tableBlock, 'craft must be called at the table')
  })
})
