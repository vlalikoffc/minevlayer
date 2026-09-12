/* eslint-env mocha */
'use strict'

const assert = require('assert')
const { Vec3 } = require('vec3')
const { injectSimple } = require('../../dist/simple')
const { injectPvp } = require('../../dist/pvp')
const { createMockBot } = require('../mocks/bot')

/**
 * Боевой мок: пишет журнал событий, чтобы проверять ПОРЯДОК
 * (мувфикс и прицел — строго ДО удара).
 */
function pvpBot (opts = {}) {
  const bot = createMockBot(opts)
  injectSimple(bot)
  injectPvp(bot)
  const log = []
  const origClear = bot.clearControlStates
  bot.clearControlStates = () => { log.push('muvfix'); origClear() }
  const origLook = bot.look.bind(bot)
  bot.look = async (yaw, pitch) => { log.push('look'); return origLook(yaw, pitch) }
  const origSet = bot.setControlState.bind(bot)
  bot.setControlState = (k, v) => {
    log.push(`${k}:${v}`)
    origSet(k, v)
    // сервер «подтверждает» прыжок: после импульса прыжка бот в воздухе
    if (k === 'jump' && v) setTimeout(() => { bot.entity.onGround = false }, 15)
  }
  bot.attack = (e) => { log.push('attack'); bot._calls.attack.push(e) }
  bot._log = log
  return bot
}

const steve = (pos) => ({ id: 8, type: 'player', username: 'Steve', position: new Vec3(...pos), isValid: true })

describe('pvp: fight()', () => {
  it('muwfix + aim happen strictly BEFORE the attack', async () => {
    const bot = pvpBot({
      position: [0, 64, 0],
      players: { Steve: { entity: steve([1, 64, 0]) } } // в пределах досягаемости
    })
    const p = bot.fight('Steve', { attackMs: 20, crits: false })
    await new Promise(resolve => setTimeout(resolve, 200))
    bot.stop()
    await p
    const log = bot._log
    const firstAttack = log.indexOf('attack')
    assert.ok(firstAttack >= 1, 'must attack at least once')
    assert.ok(log.indexOf('muvfix') < firstAttack, 'must stand still before attacking')
    assert.ok(log.indexOf('look') !== -1 && log.lastIndexOf('look', firstAttack) !== -1, 'must aim before attacking')
  })

  it('NEVER attacks beyond vanilla reach (3 blocks)', async () => {
    const target = steve([3.5, 64, 0]) // дальше 3 блоков
    const bot = pvpBot({
      position: [0, 64, 0],
      players: { Steve: { entity: target } }
    })
    // goto не приближает (мок) — но по правилам бить всё равно нельзя
    const p = bot.fight('Steve', { attackMs: 20, crits: false, range: 4 })
    await new Promise(resolve => setTimeout(resolve, 200))
    bot.stop()
    await p
    assert.strictEqual(bot._calls.attack.length, 0, 'no attacks beyond 3 blocks')
  })

  it('approaches when target is out of range', async () => {
    let gotoCalls = 0
    const bot = pvpBot({
      position: [0, 64, 0],
      players: { Steve: { entity: steve([10, 64, 10]) } }
    })
    bot.goto = async () => { gotoCalls++ }
    const p = bot.fight('Steve', { attackMs: 20 })
    await new Promise(resolve => setTimeout(resolve, 150))
    bot.stop()
    await p
    assert.ok(gotoCalls >= 1, 'must chase the target')
    assert.strictEqual(bot._calls.attack.length, 0, 'no attack while far')
    assert.ok(bot._log.includes('sprint:true'), 'sprint while far away')
  })

  it('jump crit: jump pulse before attack, sprint off', async () => {
    const bot = pvpBot({
      position: [0, 64, 0],
      players: { Steve: { entity: steve([1, 64, 0]) } }
    })
    const p = bot.fight('Steve', { attackMs: 20, crits: true })
    await new Promise(resolve => setTimeout(resolve, 250))
    bot.stop()
    await p
    const log = bot._log
    const firstAttack = log.indexOf('attack')
    assert.ok(firstAttack !== -1, 'attacked')
    const jumpIdx = log.indexOf('jump:true')
    assert.ok(jumpIdx !== -1 && jumpIdx < firstAttack, 'jump before attack (crit)')
    assert.ok(log.includes('sprint:false'), 'sprint disabled for the crit')
  })

  it('respects attack cooldown between hits', async () => {
    const bot = pvpBot({
      position: [0, 64, 0],
      players: { Steve: { entity: steve([1, 64, 0]) } }
    })
    const hits = []
    const origAttack = bot.attack
    bot.attack = (e) => { hits.push(Date.now()); origAttack(e) }
    const p = bot.fight('Steve', { attackMs: 80, crits: false })
    await new Promise(resolve => setTimeout(resolve, 450))
    bot.stop()
    await p
    assert.ok(hits.length >= 2, `expected 2+ hits, got ${hits.length}`)
    for (let i = 1; i < hits.length; i++) {
      assert.ok(hits[i] - hits[i - 1] >= 75, 'cooldown must be respected')
    }
  })

  it('stop() ends the fight cleanly', async () => {
    const bot = pvpBot({
      position: [0, 64, 0],
      players: { Steve: { entity: steve([1, 64, 0]) } }
    })
    const p = bot.fight('Steve', { attackMs: 20 })
    await new Promise(resolve => setTimeout(resolve, 60))
    bot.stop()
    await p // должен резолвиться, а не висеть
    assert.strictEqual(bot._fight, null)
  })

  it('throws when target not found', async () => {
    const bot = pvpBot()
    await assert.rejects(() => bot.fight('Ghost'), /fight target not found/)
  })
})
