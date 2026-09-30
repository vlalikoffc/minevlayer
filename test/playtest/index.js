#!/usr/bin/env node
/**
 * minevlayer playtest: 6 bots join a freshly prepared vanilla survival server
 * (no op, no cheats), give themselves tasks through the wrapper, verify every
 * task by re-reading the world, then keep playing until the session is over.
 * All tasks on all bots passed and everybody is still alive → exit 0.
 * Anything failed → exit 1 (CI goes red).
 *
 *   npm run playtest
 *   MC_VERSION=1.21.4 PLAYTEST_BOTS=6 PLAYTEST_JOIN_DELAY=5000 PLAYTEST_DURATION=900000 npm run playtest
 *   PLAYTEST_ONLY=goto,collect PLAYTEST_DURATION=120000 npm run playtest     # quick local run
 */

const fs = require('fs')
const path = require('path')

const minevlayer = require('../../dist')
const { getPort } = require('../common/util')
const { startServer } = require('./server')
const { tasks, freePlay, sleep } = require('./tasks')

const VERSION = process.env.MC_VERSION || minevlayer.latestSupportedVersion
const BOTS = Number(process.env.PLAYTEST_BOTS || 6)
const JOIN_DELAY = Number(process.env.PLAYTEST_JOIN_DELAY || 5000)
const DURATION = Number(process.env.PLAYTEST_DURATION || 15 * 60_000)
const ONLY = (process.env.PLAYTEST_ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
const REPORT = process.env.PLAYTEST_REPORT || 'playtest-report.json'
const SEED = process.env.PLAYTEST_SEED || ''
const SERVER_LOG = process.env.PLAYTEST_SERVER_LOG === '1'

const c = {
  g: s => `\x1b[32m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`,
  d: s => `\x1b[2m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`
}

function spawnBot (options) {
  return new Promise((resolve, reject) => {
    const bot = minevlayer.createBot(options)
    bot.playtest = { disconnected: false, deaths: 0, kicked: null, errors: [] }
    const timer = setTimeout(() => reject(new Error(`${options.username} did not spawn within 90s`)), 90_000)
    bot.once('spawn', () => { clearTimeout(timer); resolve(bot) })
    bot.on('kicked', reason => { bot.playtest.kicked = JSON.stringify(reason); clearTimeout(timer); reject(new Error(`${options.username} kicked: ${bot.playtest.kicked}`)) })
    bot.on('error', err => { bot.playtest.errors.push(err.message); clearTimeout(timer); reject(err) })
    bot.on('end', () => { bot.playtest.disconnected = true })
    bot.on('death', () => { bot.playtest.deaths++ })
  })
}

async function runTask (bot, task, ctx) {
  const startedAt = Date.now()
  let timer
  const watchdog = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${task.timeout}ms`)), task.timeout) })
  let result
  try {
    await Promise.race([task.run(bot, ctx), watchdog])
    result = { bot: bot.username, task: task.name, ok: true, ms: Date.now() - startedAt }
  } catch (err) {
    result = { bot: bot.username, task: task.name, ok: false, ms: Date.now() - startedAt, error: err.message }
  } finally {
    clearTimeout(timer)
    try { bot.stop() } catch {}
  }
  if (bot.playtest.disconnected) throw new Error(`${bot.username} lost the connection during "${task.name}"`)
  return result
}

async function playSession (bot, bots, untilMs, results) {
  const log = msg => console.log(c.d(`  [${bot.username}] ${msg}`))
  const ctx = { others: bots.filter(b => b !== bot), log, disconnected: b => b.playtest.disconnected }
  const selected = tasks.filter(t => ONLY.length === 0 || ONLY.includes(t.name))
  for (const task of selected) {
    let result
    try {
      result = await runTask(bot, task, ctx)
    } catch (err) {
      result = { bot: bot.username, task: task.name, ok: false, error: err.message }
      results.push(result)
      console.log(c.r(`  ✘ ${bot.username} ${task.name}: ${result.error}`))
      return
    }
    results.push(result)
    console.log(result.ok
      ? c.g(`  ✔ ${bot.username} ${task.name}`) + c.d(` ${result.ms}ms`)
      : c.r(`  ✘ ${bot.username} ${task.name}: ${result.error}`) + c.d(` ${result.ms}ms`))
  }
  // tasks done — keep playing like a real player until the session ends
  await freePlay(bot, ctx, untilMs)
  const alive = !bot.playtest.disconnected && bot.health > 0 && bot.playtest.deaths === 0
  results.push({
    bot: bot.username,
    task: 'survive',
    ok: alive,
    error: alive ? undefined : `disconnected=${bot.playtest.disconnected} deaths=${bot.playtest.deaths} health=${bot.health} food=${bot.food} kicked=${bot.playtest.kicked}`
  })
  console.log(alive
    ? c.g(`  ✔ ${bot.username} survive`) + c.d(` health=${bot.health} food=${bot.food}`)
    : c.r(`  ✘ ${bot.username} survive: ${results[results.length - 1].error}`))
}

async function main () {
  const registry = require('prismarine-registry')(VERSION)
  const mcVersion = registry.version.minecraftVersion
  console.log(c.b(`\nminevlayer playtest — Minecraft ${mcVersion}, ${BOTS} bots, ${Math.round(DURATION / 60_000)} min session\n`))

  const results = []
  const bots = []
  let server
  let startedOk = false
  try {
    server = await startServer({
      mcVersion,
      port: await getPort(),
      dir: path.join(__dirname, `server_${mcVersion}`),
      log: SERVER_LOG,
      seed: SEED
    })
    startedOk = true

    for (let i = 1; i <= BOTS; i++) {
      if (i > 1) await sleep(JOIN_DELAY)
      const username = `VlBot${i}`
      console.log(`joining ${username}…`)
      const bot = await spawnBot({ host: server.host, port: server.port, version: VERSION, username, checkTimeoutInterval: 120_000 })
      bots.push(bot)
    }
    await Promise.all(bots.map(b => b.waitForChunksToLoad()))
    const plugins = ['pathfinder', 'collectBlock', 'pvp'].filter(p => bots[0][p]).join(', ') || 'none (built-in fallbacks)'
    console.log(`\nall ${bots.length} bots are in. plugins: ${plugins}. playing for ${Math.round(DURATION / 60_000)} min\n`)

    const untilMs = Date.now() + DURATION
    await Promise.all(bots.map(bot => playSession(bot, bots, untilMs, results)))
  } catch (err) {
    console.error(c.r(`\nplaytest broke: ${err.stack || err}`))
    if (server && !startedOk) console.error(server.lastLines().join('\n'))
    results.push({ bot: '-', task: 'bootstrap', ok: false, error: err.message })
  } finally {
    console.log('\nshutting down bots…')
    for (const bot of bots) { try { bot.quit() } catch {} }
    await sleep(1000)
    if (server) {
      console.log('stopping server…')
      await server.stop()
    }
  }

  const failed = results.filter(r => !r.ok)
  const report = { version: mcVersion, date: new Date().toISOString(), bots: BOTS, durationMs: DURATION, total: results.length, passed: results.length - failed.length, failed: failed.length, results }
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2))

  console.log(c.b('\n==================== playtest summary ===================='))
  const byTask = {}
  for (const r of results) (byTask[r.task] ||= []).push(r)
  for (const [task, rs] of Object.entries(byTask)) {
    const bad = rs.filter(r => !r.ok)
    console.log(`${bad.length ? c.r('FAIL') : c.g('PASS')}  ${task.padEnd(16)} ${rs.length - bad.length}/${rs.length} bots`)
  }
  console.log(`\n${report.passed}/${report.total} checks passed — report: ${REPORT}`)
  if (failed.length) {
    console.log(c.r(`\n${failed.length} failed:`))
    for (const r of failed) console.log(c.r(`  - ${r.bot} ${r.task}: ${r.error}`))
    process.exit(1)
  }
  console.log(c.g('\nEverything passed: the bots played 15 minutes of survival and did their jobs.'))
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
