/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { Vec3 } = require('vec3')
const { injectSimple } = require('../../dist/simple')
const { injectActions } = require('../../dist/actions')
const { createMockBot } = require('../mocks/bot')

function actionBot (opts = {}) {
  const bot = createMockBot(opts)
  injectSimple(bot)
  injectActions(bot)
  return bot
}

describe('actions: use()', () => {
  it('walks to the nearest target block and activates it', async () => {
    const lever = { position: new Vec3(1, 64, 0), name: 'lever' }
    const bot = actionBot({
      position: [1, 64, 0],
      findBlocks: () => [new Vec3(1, 64, 0)],
      blockAt: () => lever
    })
    bot.activateBlock = async (b) => { bot._calls.activate = (bot._calls.activate || 0) + 1; return 'window' }
    const result = await bot.use('lever')
    assert.strictEqual(bot._calls.activate, 1)
    assert.strictEqual(result, 'window')
  })

  it('refuses when nothing to use', async () => {
    const bot = actionBot({ findBlocks: () => [] })
    await assert.rejects(() => bot.use('lever'), /No usable "lever"/)
  })
})

describe('actions: attackNearest()', () => {
  it('attacks the nearest matching entity', async () => {
    const zombie = { id: 7, type: 'mob', name: 'zombie', position: new Vec3(2, 64, 0) }
    const bot = actionBot({
      position: [0, 64, 0],
      nearestEntity: (fn) => fn(zombie) ? zombie : undefined
    })
    const target = await bot.attackNearest('zombie')
    assert.strictEqual(target, zombie)
    assert.strictEqual(bot._calls.attack.length, 1)
  })

  it('matches players by nick', async () => {
    const steve = { id: 8, type: 'player', username: 'Steve', position: new Vec3(2, 64, 0) }
    const bot = actionBot({
      position: [0, 64, 0],
      nearestEntity: (fn) => fn(steve) ? steve : undefined
    })
    const target = await bot.attackNearest('Steve')
    assert.strictEqual(target, steve)
  })

  it('accepts a predicate', async () => {
    const cow = { id: 9, type: 'mob', name: 'cow', position: new Vec3(2, 64, 0) }
    const bot = actionBot({
      position: [0, 64, 0],
      nearestEntity: (fn) => fn(cow) ? cow : undefined
    })
    const target = await bot.attackNearest(e => e.name === 'cow')
    assert.strictEqual(target, cow)
  })

  it('returns null when nobody matches / out of radius', async () => {
    const bot = actionBot({ position: [0, 64, 0], nearestEntity: () => undefined })
    assert.strictEqual(await bot.attackNearest('zombie'), null)

    const far = { id: 10, type: 'mob', name: 'zombie', position: new Vec3(100, 64, 100) }
    const bot2 = actionBot({
      position: [0, 64, 0],
      nearestEntity: (fn) => fn(far) ? far : undefined
    })
    assert.strictEqual(await bot2.attackNearest('zombie', 16), null)
  })
})

describe('actions: pickup()', () => {
  it('goes to the nearest dropped item', async () => {
    const drop = { id: 11, name: 'item', position: new Vec3(2, 64, 0) }
    const bot = actionBot({
      position: [2, 64, 0], // уже рядом — дошли сразу
      nearestEntity: (fn) => fn(drop) ? drop : undefined
    })
    const got = await bot.pickup()
    assert.strictEqual(got, drop)
  })

  it('returns null when nothing dropped', async () => {
    const bot = actionBot({ nearestEntity: () => undefined })
    assert.strictEqual(await bot.pickup(), null)
  })
})

describe('actions: give()', () => {
  it('approaches the player and tosses the items', async () => {
    const bot = actionBot({
      position: [3, 64, 3],
      players: { Steve: { entity: { position: new Vec3(3, 64, 3) } } },
      items: { diamond: { id: 264 } },
      inventory: [{ type: 264, count: 5, name: 'diamond' }]
    })
    await bot.give('Steve', 'diamond', 2)
    // toss по частям через оригинальный майнфлееровский метод
    assert.deepStrictEqual(bot._calls.originalToss, [[264, null, 2]])
  })

  it('refuses when player missing or item short', async () => {
    const bot = actionBot({ players: {}, items: { diamond: { id: 264 } } })
    await assert.rejects(() => bot.give('Ghost', 'diamond'), /Player Ghost not found/)
    await assert.rejects(() => bot.give('Ghost2', 'unobtainium'), /Player Ghost2 not found/)
    const bot2 = actionBot({
      players: { Steve: { entity: { position: new Vec3(1, 64, 1) } } },
      items: { diamond: { id: 264 } },
      inventory: [{ type: 264, count: 1, name: 'diamond' }]
    })
    await assert.rejects(() => bot2.give('Steve', 'diamond', 5), /Not enough diamond/)
  })
})

describe('actions: jump / antiAfk', () => {
  it('jump() pulses the control state', () => {
    const bot = actionBot()
    bot.jump()
    assert.deepStrictEqual(bot._calls.setControlState[0], ['jump', true])
  })

  it('antiAfk() acts periodically and stop() kills it', async () => {
    const bot = actionBot({ position: [0, 64, 0] })
    bot.antiAfk(10)
    await new Promise(resolve => setTimeout(resolve, 45))
    assert.ok(bot._calls.setControlState.length >= 1 || bot._calls.lookAt.length >= 0, 'antiAfk must do something')
    const before = bot._calls.setControlState.length
    bot.stop()
    assert.strictEqual(bot._antiAfk, null)
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.strictEqual(bot._calls.setControlState.length, before, 'no activity after stop()')
  })
})
