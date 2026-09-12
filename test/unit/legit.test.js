/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { applyLegitOptions } = require('../../dist')
const { injectSimple } = require('../../dist/simple')
const { injectLife } = require('../../dist/life')
const { injectActions } = require('../../dist/actions')
const { injectPvp } = require('../../dist/pvp')
const { injectHuman } = require('../../dist/human')
const { wireKnockback } = require('../../dist/physics')
const { Brain } = require('../../dist/brain')
const { TaskManager } = require('../../dist/tasks')
const { createMockBot } = require('../mocks/bot')

/** Полный стек обёртки на мок-бота — как в createBot, но без подключения. */
function fullBot (opts = {}) {
  const bot = createMockBot(opts)
  injectSimple(bot)
  injectLife(bot)
  injectActions(bot)
  injectPvp(bot)
  injectHuman(bot)
  wireKnockback(bot)
  bot.brain = new Brain(bot)
  bot.tasks = new TaskManager(bot)
  return bot
}

describe('legit options', () => {
  it('defaults: legit ON, brand vanilla, idle ON', () => {
    const out = applyLegitOptions({ host: 'localhost' })
    assert.strictEqual(out.legit, true)
    assert.strictEqual(out.brand, 'vanilla')
    assert.strictEqual(out.legitIdle, true)
    assert.strictEqual(out.host, 'localhost')
  })

  it('legit:false disables everything, keeps user options', () => {
    const out = applyLegitOptions({ host: 'localhost', legit: false })
    assert.strictEqual(out.brand, undefined)
    assert.strictEqual(out.legitIdle, false)
  })

  it('explicit brand is never overridden', () => {
    const out = applyLegitOptions({ brand: 'MyCustomClient' })
    assert.strictEqual(out.brand, 'MyCustomClient')
  })

  it('idle can be disabled separately', () => {
    const out = applyLegitOptions({ legitIdle: false })
    assert.strictEqual(out.legit, true)
    assert.strictEqual(out.legitIdle, false)
  })
})

describe('legit idle: never interferes with active controls', () => {
  it('skips idle actions while the bot is busy (WASD pressed)', async () => {
    const bot = fullBot({ position: [0, 64, 0] })
    bot.controlState = { forward: true } // бот идёт
    bot.human.idle({ minMs: 5, maxMs: 10 })
    await new Promise(resolve => setTimeout(resolve, 80))
    const busyActions = bot._calls.look.length + bot._calls.setControlState.length
    assert.strictEqual(busyActions, 0, 'no idle fidgets while moving')

    bot.controlState.forward = false // бот остановился
    await new Promise(resolve => setTimeout(resolve, 80))
    const idleActions = bot._calls.look.length + bot._calls.setControlState.length
    assert.ok(idleActions >= 1, 'fidgets resume when idle')
    bot.human.stopIdle()
  })
})

describe('parallel bots: full independence', () => {
  it('two fully-wrapped bots share no state', async () => {
    const a = fullBot({ position: [0, 64, 0] })
    const b = fullBot({ position: [100, 64, 100] })

    // у первого живой простой и откат, второй живёт своей жизнью
    a.human.idle({ minMs: 5, maxMs: 10 })
    a.emit('entityHurt', a.entity)

    await new Promise(resolve => setTimeout(resolve, 60))

    assert.ok(a._lastKnockback > 0, 'A got its knockback recorded')
    assert.strictEqual(b._lastKnockback, undefined, 'B is unaffected')

    const aActions = a._calls.look.length + a._calls.setControlState.length
    const bActions = b._calls.look.length + b._calls.setControlState.length
    assert.ok(aActions >= 1, 'A idle acts')
    assert.strictEqual(bActions, 0, 'B idle not running — independent')

    // мозг и задачи — тоже отдельные
    a.tasks.custom({ name: 'solo', priority: 1, run: async () => { a._soloRan = true } })
    await a.tasks.get('solo').run(a)
    assert.strictEqual(a._soloRan, true)
    assert.strictEqual(b.tasks.get('solo'), undefined, 'task registry is per-bot')

    a.human.stopIdle()
  })
})
