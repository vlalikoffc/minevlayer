/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { Vec3 } = require('vec3')
const { injectSimple } = require('../../dist/simple')
const { createMockBot } = require('../mocks/bot')

function makeBot (opts) {
  const bot = createMockBot(opts)
  injectSimple(bot)
  return bot
}

describe('simple layer', () => {
  it('injects the full one-line API', () => {
    const bot = makeBot()
    const methods = [
      'break', 'mine', 'collect', 'goto', 'follow', 'stop', 'place',
      'equipBest', 'has', 'toss', 'craftSimple', 'onChat', 'when', 'wait',
      'say', 'autoEat', 'guard', 'findNearest', 'findAll'
    ]
    for (const m of methods) {
      assert.strictEqual(typeof bot[m], 'function', `bot.${m} must be a function`)
    }
  })

  describe('has()', () => {
    it('counts stacks across the inventory', () => {
      const bot = makeBot({
        items: { bread: { id: 297 } },
        inventory: [{ type: 297, count: 5 }, { type: 297, count: 6 }]
      })
      assert.strictEqual(bot.has('bread', 11), true)
      assert.strictEqual(bot.has('bread', 12), false)
    })
    it('returns false for unknown items', () => {
      const bot = makeBot()
      assert.strictEqual(bot.has('unobtainium'), false)
    })
  })

  describe('findNearest / findAll', () => {
    it('returns block from findBlocks + blockAt', () => {
      const block = { position: new Vec3(1, 2, 3), type: 3, name: 'dirt' }
      const bot = makeBot({
        blocks: { dirt: { id: 3 } },
        findBlocks: () => [new Vec3(1, 2, 3)],
        blockAt: () => block
      })
      assert.strictEqual(bot.findNearest('dirt'), block)
      assert.strictEqual(bot.findAll('dirt').length, 1)
    })
    it('returns null when nothing found', () => {
      const bot = makeBot({ blocks: { dirt: { id: 3 } } })
      assert.strictEqual(bot.findNearest('dirt'), null)
    })
  })

  describe('toss()', () => {
    it('tosses exact count via the ORIGINAL toss (no recursion)', async () => {
      const bot = makeBot({
        items: { dirt: { id: 3 } },
        inventory: [{ type: 3, count: 64 }, { type: 3, count: 10 }]
      })
      await bot.toss('dirt', 70)
      assert.deepStrictEqual(bot._calls.originalToss, [[3, null, 64], [3, null, 6]])
      assert.strictEqual(bot._calls.tossStack.length, 0)
    })
    it('tosses a whole stack without count', async () => {
      const bot = makeBot({
        items: { dirt: { id: 3 } },
        inventory: [{ type: 3, count: 64 }]
      })
      await bot.toss('dirt')
      assert.strictEqual(bot._calls.tossStack.length, 1)
      assert.strictEqual(bot._calls.originalToss.length, 0)
    })
    it('throws on unknown item', async () => {
      const bot = makeBot()
      await assert.rejects(() => bot.toss('unobtainium'), /Unknown item/)
    })
    it('throws when not enough items', async () => {
      const bot = makeBot({
        items: { dirt: { id: 3 } },
        inventory: [{ type: 3, count: 10 }]
      })
      await assert.rejects(() => bot.toss('dirt', 100), /Had only 10/)
    })
  })

  describe('goto()', () => {
    it('resolves instantly when already in range', async () => {
      const bot = makeBot({ position: [10, 64, 20] })
      await bot.goto({ x: 10, y: 64, z: 20 })
      await bot.goto('10 64 20')
      await bot.goto('10, 64, 20')
    })
    it('throws on unknown player', async () => {
      const bot = makeBot()
      await assert.rejects(() => bot.goto('player:Ghost'), /Player Ghost not found/)
    })
    it('throws when target resolves to nothing', async () => {
      const bot = makeBot()
      await assert.rejects(() => bot.goto('no_such_block_xyz'), /Cannot resolve goto target/)
    })
    it('throws on malformed coordinate string', async () => {
      const bot = makeBot()
      await assert.rejects(() => bot.goto('1 2'), /Cannot parse coordinates/)
    })
    it('resolves a known player position', async () => {
      const bot = makeBot({
        position: [5, 64, 5],
        players: { Steve: { entity: { position: new Vec3(5, 64, 5) } } }
      })
      await bot.goto('Steve')
      await bot.goto('player:Steve')
    })
  })

  describe('follow()', () => {
    it('throws when target not found', async () => {
      const bot = makeBot()
      await assert.rejects(() => bot.follow('Ghost'), /follow target not found/)
    })
    it('one-shot follow resolves when already close', async () => {
      const entity = { position: new Vec3(0, 64, 0), type: 'player', id: 9, isValid: true, username: 'Steve' }
      const bot = makeBot({ position: [0, 64, 0], nearestEntity: () => entity })
      await bot.follow('Steve', { continuous: false })
    })
    it('continuous follow registers a timer that stop() clears', async () => {
      const entity = { position: new Vec3(3, 64, 3), type: 'player', id: 9, isValid: true, username: 'Steve' }
      const bot = makeBot({ position: [0, 64, 0], nearestEntity: () => entity })
      await bot.follow('Steve')
      assert.ok(bot._followInterval, 'follow must run continuously')
      bot.stop()
      assert.strictEqual(bot._followInterval, null)
    })
  })

  describe('break() / mine()', () => {
    it('throws when block not found', async () => {
      const bot = makeBot()
      await assert.rejects(() => bot.break('diamond_ore'), /Block not found/)
    })
    it('finds, walks (skipped — already close), equips and digs', async () => {
      const block = {
        position: new Vec3(1, 64, 1),
        type: 17,
        name: 'oak_log',
        digTime: () => 1
      }
      const bot = makeBot({
        blocks: { oak_log: { id: 17 } },
        findBlocks: () => [new Vec3(1, 64, 1)],
        blockAt: () => block
      })
      await bot.break('oak_log')
      assert.strictEqual(bot._calls.dig.length, 1)
      assert.strictEqual(bot._calls.dig[0], block)
    })
    it('mine() breaks N blocks', async () => {
      const block = {
        position: new Vec3(1, 64, 1),
        type: 1,
        name: 'stone',
        digTime: () => 1
      }
      const bot = makeBot({
        blocks: { stone: { id: 1 } },
        findBlocks: () => [new Vec3(1, 64, 1)],
        blockAt: () => block
      })
      await bot.mine('stone', 3)
      assert.strictEqual(bot._calls.dig.length, 3)
    })
  })

  describe('collect()', () => {
    it('falls back to mine() when collectblock is absent', async () => {
      const block = { position: new Vec3(1, 64, 1), type: 1, name: 'stone', digTime: () => 1 }
      const bot = makeBot({
        blocks: { stone: { id: 1 } },
        findBlocks: () => [new Vec3(1, 64, 1)],
        blockAt: () => block
      })
      await bot.collect('stone', 2)
      assert.strictEqual(bot._calls.dig.length, 2)
    })
    it('uses collectblock with REAL Block objects when available', async () => {
      const block = { position: new Vec3(1, 64, 1), type: 1, name: 'stone', digTime: () => 1 }
      const bot = makeBot({
        blocks: { stone: { id: 1 } },
        findBlocks: () => [new Vec3(1, 64, 1)],
        blockAt: () => block
      })
      const collected = []
      bot.collectBlock = { collect: async (blocks) => { collected.push(blocks) } }
      await bot.collect('stone', 1)
      assert.strictEqual(collected.length, 1)
      assert.strictEqual(collected[0][0], block, 'collectblock must receive the real Block instance')
      assert.strictEqual(bot._calls.dig.length, 0)
    })
  })

  describe('place()', () => {
    it('throws when item missing', async () => {
      const bot = makeBot({ items: { cobblestone: { id: 4 } } })
      await assert.rejects(() => bot.place('cobblestone'), /No cobblestone in inventory/)
    })
    it('throws on unknown block', async () => {
      const bot = makeBot()
      await assert.rejects(() => bot.place('unobtainium'), /Unknown block/)
    })
    it('places on the reference block', async () => {
      const refBlock = { position: new Vec3(0, 63, 0) }
      const bot = makeBot({
        items: { cobblestone: { id: 4 } },
        inventory: [{ type: 4, count: 2 }]
      })
      await bot.place('cobblestone', refBlock)
      assert.strictEqual(bot._calls.placeBlock.length, 1)
      assert.strictEqual(bot._calls.placeBlock[0][0], refBlock)
    })
    it('retries other faces when the first fails', async () => {
      const refBlock = { position: new Vec3(0, 63, 0) }
      let n = 0
      const bot = makeBot({
        items: { cobblestone: { id: 4 } },
        inventory: [{ type: 4, count: 2 }],
        placeBlock: async () => {
          n++
          if (n === 1) throw new Error('face blocked')
        }
      })
      await bot.place('cobblestone', refBlock)
      assert.ok(n >= 2, 'must retry another face')
    })
  })

  describe('craftSimple()', () => {
    it('throws when no recipe', async () => {
      const bot = makeBot({ items: { stick: { id: 280 } } })
      await assert.rejects(() => bot.craftSimple('stick'), /No recipe available/)
    })
    it('crafts the first available recipe', async () => {
      const recipe = { result: 280 }
      const bot = makeBot({
        items: { stick: { id: 280 } },
        recipesFor: () => [recipe]
      })
      await bot.craftSimple('stick', 2)
      assert.deepStrictEqual(bot._calls.craft, [[recipe, 2, undefined]])
    })
  })

  describe('chat & misc sugar', () => {
    it('onChat fires on trigger, ignores self', () => {
      const bot = makeBot()
      const heard = []
      bot.onChat('привет', (username, message) => heard.push([username, message]))
      bot.emit('chat', 'Steve', 'привет всем')
      bot.emit('chat', 'TestBot', 'привет, я сам с собой') // себя игнорим
      bot.emit('chat', 'Alex', 'пока') // не совпадает
      assert.deepStrictEqual(heard, [['Steve', 'привет всем']])
    })
    it('say() writes to chat', () => {
      const bot = makeBot()
      bot.say('hello')
      assert.deepStrictEqual(bot._calls.chat, ['hello'])
    })
    it('wait() delegates to waitForTicks', async () => {
      const bot = makeBot()
      let waited = null
      bot.waitForTicks = async (t) => { waited = t }
      await bot.wait(5)
      assert.strictEqual(waited, 5)
    })
    it('when() is an alias of on()', () => {
      const bot = makeBot()
      let fired = 0
      bot.when('spawn', () => { fired++ })
      bot.emit('spawn')
      assert.strictEqual(fired, 1)
    })
  })

  describe('guard() / stop()', () => {
    it('guard attacks mobs in radius, stop() detaches everything', () => {
      const bot = makeBot({ position: [0, 64, 0] })
      const mob = { type: 'mob', position: new Vec3(2, 64, 2) }
      bot.nearestEntity = () => mob
      bot.guard({ x: 0, y: 64, z: 0 }, 10)
      assert.strictEqual(bot.listenerCount('physicsTick'), 1)
      bot.emit('physicsTick')
      assert.strictEqual(bot._calls.attack.length, 1)
      bot.stop()
      assert.strictEqual(bot.listenerCount('physicsTick'), 0)
      assert.ok(bot._calls.clearControlStates >= 1)
    })
  })
})
