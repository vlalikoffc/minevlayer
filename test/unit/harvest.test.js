/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { Vec3 } = require('vec3')
const { getHarvestTools, findBestTool } = require('../../dist/helpers')
const { injectSimple } = require('../../dist/simple')
const { createMockBot } = require('../mocks/bot')

/** Регистри с данными как в настоящей игре: алмазная руда добывается железной+ киркой */
const IRON_PICK = 257
const STONE_PICK = 274
const DIAMOND_ORE = {
  id: 56,
  harvestTools: { [IRON_PICK]: true, 278: true } // железная и алмазная (золотой НЕТ — как в игре)
}
const REGISTRY = {
  blocksByName: { diamond_ore: DIAMOND_ORE, dirt: { id: 3 } },
  blocksById: { 56: DIAMOND_ORE, 3: { id: 3 } },
  itemsByName: { iron_pickaxe: { id: IRON_PICK }, stone_pickaxe: { id: STONE_PICK } },
  itemsById: { [IRON_PICK]: { name: 'iron_pickaxe' }, 278: { name: 'diamond_pickaxe' }, [STONE_PICK]: { name: 'stone_pickaxe' } }
}

function diamondBot (items) {
  const bot = createMockBot({
    position: [0, 64, 0],
    blocks: REGISTRY.blocksByName,
    items: REGISTRY.itemsByName,
    inventory: items
  })
  bot.registry = REGISTRY
  bot._findBlocksImpl = () => [new Vec3(1, 64, 1)]
  bot._blockAtImpl = () => ({
    position: new Vec3(1, 64, 1),
    type: 56,
    name: 'diamond_ore',
    digTime: (type) => (type === IRON_PICK ? 2 : 100)
  })
  injectSimple(bot)
  return bot
}

describe('harvest check (tool gating)', () => {
  describe('getHarvestTools()', () => {
    it('returns allowed tools from game data', () => {
      const bot = createMockBot()
      bot.registry = REGISTRY
      const h = getHarvestTools(bot, 'diamond_ore')
      assert.deepStrictEqual(h.ids.sort(), [257, 278])
      assert.deepStrictEqual(h.names.sort(), ['diamond_pickaxe', 'iron_pickaxe'])
    })
    it('returns null when no tool is required', () => {
      const bot = createMockBot()
      bot.registry = REGISTRY
      assert.strictEqual(getHarvestTools(bot, 'dirt'), null)
    })
  })

  describe('findBestTool() with allowed ids', () => {
    it('ignores faster but unsuitable tools', () => {
      const block = {
        // каменная кирка «быстрее», но ей нельзя добывать алмазную руду
        digTime: (type) => (type === STONE_PICK ? 1 : type === IRON_PICK ? 2 : 999)
      }
      const slots = new Array(46).fill(null)
      slots[9] = { type: STONE_PICK, enchants: [] }
      slots[10] = { type: IRON_PICK, enchants: [] }
      const bot = { inventory: { slots } }
      assert.strictEqual(findBestTool(bot, block, [IRON_PICK]), 10)
      assert.strictEqual(findBestTool(bot, block, null), 9) // без фильтра — «быстрейший»
    })
  })

  describe('bot.dig / bot.break / bot.mine gating', () => {
    it('refuses to mine diamond ore without a suitable pickaxe', async () => {
      const bot = diamondBot([{ type: STONE_PICK, count: 1, name: 'stone_pickaxe' }])
      await assert.rejects(
        () => bot.dig('diamond_ore'),
        (e) => {
          assert.match(e.message, /Refusing to mine diamond_ore/)
          assert.match(e.message, /iron_pickaxe/) // говорит чем именно
          assert.match(e.message, /stone_pickaxe/) // и что есть в инвентаре
          return true
        }
      )
      assert.strictEqual(bot._calls.dig.length, 0, 'must not dig without the tool')
    })

    it('refuses with empty inventory', async () => {
      const bot = diamondBot([])
      await assert.rejects(() => bot.break('diamond_ore'), /\(empty\)/)
    })

    it('mines fine with an iron pickaxe', async () => {
      const bot = diamondBot([{ type: IRON_PICK, count: 1 }])
      await bot.dig('diamond_ore')
      assert.strictEqual(bot._calls.dig.length, 1)
    })

    it('force: true digs anyway (for advanced users)', async () => {
      const bot = diamondBot([])
      await bot.break('diamond_ore', { force: true })
      assert.strictEqual(bot._calls.dig.length, 1)
    })

    it('blocks without tool requirement dig freely', async () => {
      const bot = createMockBot({
        position: [0, 64, 0],
        blocks: { dirt: { id: 3 } },
        findBlocks: () => [new Vec3(1, 64, 1)],
        blockAt: () => ({ position: new Vec3(1, 64, 1), type: 3, name: 'dirt', digTime: () => 1 })
      })
      await bot.dig('dirt')
      assert.strictEqual(bot._calls.dig.length, 1)
    })

    it('default count is 1: mine() without count breaks exactly one', async () => {
      const bot = diamondBot([{ type: IRON_PICK, count: 1 }])
      await bot.mine('diamond_ore')
      assert.strictEqual(bot._calls.dig.length, 1)
    })

    it('bot.dig(Block) still works like vanilla mineflayer', async () => {
      const bot = diamondBot([])
      const block = { position: new Vec3(1, 64, 1) }
      await bot.dig(block)
      assert.strictEqual(bot._calls.dig.length, 1)
      assert.strictEqual(bot._calls.dig[0], block)
    })
  })
})
