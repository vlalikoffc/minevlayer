/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { injectHuman } = require('../../dist/human')
const { injectSimple } = require('../../dist/simple')
const { injectActions } = require('../../dist/actions')
const { createMockBot } = require('../mocks/bot')

function humanBot (opts = {}) {
  const bot = createMockBot(opts)
  injectHuman(bot)
  return bot
}

describe('human: idle (живой простой)', () => {
  it('performs human-like micro actions over time', async () => {
    const bot = humanBot({ position: [0, 64, 0] })
    bot.human.idle({ minMs: 5, maxMs: 10 })
    await new Promise(resolve => setTimeout(resolve, 120))
    const actions = bot._calls.look.length + bot._calls.setControlState.length
    assert.ok(actions >= 2, `expected several idle actions, got ${actions}`)
    assert.strictEqual(bot.human.status().idleActive, true)
    bot.human.stopIdle()
  })

  it('stopIdle() halts all activity', async () => {
    const bot = humanBot({ position: [0, 64, 0] })
    bot.human.idle({ minMs: 5, maxMs: 10 })
    await new Promise(resolve => setTimeout(resolve, 40))
    bot.human.stopIdle()
    const before = bot._calls.look.length + bot._calls.setControlState.length
    await new Promise(resolve => setTimeout(resolve, 60))
    const after = bot._calls.look.length + bot._calls.setControlState.length
    assert.strictEqual(after, before, 'no actions after stopIdle()')
    assert.strictEqual(bot.human.status().idleActive, false)
  })

  it('bot.stop() stops the idle too', async () => {
    const bot = humanBot({ position: [0, 64, 0] })
    injectSimple(bot)
    bot.human.idle({ minMs: 5, maxMs: 10 })
    await new Promise(resolve => setTimeout(resolve, 30))
    bot.stop()
    assert.strictEqual(bot.human.status().idleActive, false)
  })

  it('antiAfk() delegates to the human idle when available', async () => {
    const bot = humanBot({ position: [0, 64, 0] })
    injectSimple(bot)
    injectActions(bot)
    bot.human.idle = (opts) => { bot._idleOpts = opts }
    bot.antiAfk(30000)
    assert.deepStrictEqual(bot._idleOpts, { minMs: 5000, maxMs: 30000 })
  })
})

describe('human: physics sanity', () => {
  it('status() reports ground and physics state', () => {
    const bot = humanBot({ position: [0, 64, 0] })
    const s = bot.human.status()
    assert.strictEqual(s.physicsEnabled, true)
    assert.strictEqual(s.onGround, true)
    assert.strictEqual(s.airborneMs, 0)
    assert.strictEqual(s.sinceKnockbackMs, 0)
  })

  it('tracks airborne time via physicsTick', () => {
    const bot = humanBot({ position: [0, 64, 0] })
    bot.entity.onGround = false
    bot.emit('physicsTick')
    assert.ok(bot.human.status().airborneMs >= 0)
    bot.entity.onGround = true
    bot.emit('physicsTick')
    assert.strictEqual(bot.human.status().airborneMs, 0, 'landed — airborne reset')
  })

  it('raises physics_anomaly when airborne suspiciously long', async () => {
    const bot = humanBot({ position: [0, 80, 0] })
    const anomalies = []
    bot.on('physics_anomaly', (e) => anomalies.push(e))
    bot.entity.onGround = false
    bot.emit('physicsTick') // полетели
    // «прошло» 6 секунд: подкручиваем _airborneSince в прошлое
    bot.human._airborneSince = Date.now() - 6000
    bot.emit('physicsTick')
    assert.strictEqual(anomalies.length, 1)
    assert.strictEqual(anomalies[0].reason, 'airborne_too_long')
  })
})
