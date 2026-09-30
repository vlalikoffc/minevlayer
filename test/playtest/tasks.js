/**
 * The tasks a playtest bot gives itself. Plain survival, no op, no commands:
 * everything is done through the minevlayer wrapper and verified by
 * re-reading the world / the inventory afterwards.
 *
 * Every task: { name, timeout, run(bot, ctx) } — throws to fail.
 * ctx = { others: MinevlayerBot[], log(msg) }
 */

const { Vec3 } = require('vec3')

const LOG_TYPES = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log', 'pale_oak_log']
const DIGGABLE = ['grass_block', 'dirt', 'sand', 'gravel', 'stone']

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor (predicate, { timeout = 10_000, interval = 100, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await sleep(interval)
  }
  throw new Error(`timeout (${timeout}ms) waiting for ${what}`)
}

function assert (condition, message) {
  if (!condition) throw new Error(message)
}

function count (bot, itemName) {
  return bot.inventory.items().filter(i => i.name === itemName).reduce((acc, i) => acc + i.count, 0)
}

/** Top solid block of the column at (x, z), searched around the bot's feet level. */
function groundAt (bot, x, z) {
  const feet = Math.floor(bot.entity.position.y)
  for (let y = feet + 2; y >= feet - 4; y--) {
    const block = bot.blockAt(new Vec3(x, y, z))
    const above = bot.blockAt(new Vec3(x, y + 1, z))
    if (block && block.boundingBox === 'block' && above && above.boundingBox === 'empty') return block
  }
  return null
}

function findAnyLog (bot, maxDistance = 64) {
  let best = null
  for (const name of LOG_TYPES) {
    const block = bot.findNearest(name, maxDistance)
    if (!block) continue
    const d = bot.entity.position.distanceTo(block.position)
    if (!best || d < best.d) best = { block, d, name }
  }
  return best
}

const tasks = [
  {
    name: 'find',
    timeout: 15_000,
    async run (bot) {
      // "найди": a fresh survival spawn always has something diggable around
      const found = DIGGABLE.map(n => ({ n, block: bot.findNearest(n, 32) })).filter(x => x.block)
      assert(found.length > 0, `findNearest found none of ${DIGGABLE.join('/')} within 32 blocks`)
      for (const { n, block } of found) {
        assert(block.name === n, `findNearest("${n}") returned a ${block.name}`)
        const real = bot.blockAt(block.position)
        assert(real && real.name === n, `world says ${real?.name} at ${block.position}, findNearest said ${n}`)
      }
      const all = bot.findAll(found[0].n, 32, 20)
      assert(all.length >= 5, `findAll("${found[0].n}") returned only ${all.length} positions`)
      assert(bot.findNearest('ancient_debris', 16) === null, 'findNearest "found" ancient_debris at the surface')
    }
  },

  {
    name: 'goto',
    timeout: 60_000,
    async run (bot, ctx) {
      // "доберись": pick a reachable ground spot ~6 blocks away and walk there
      const start = bot.entity.position.clone()
      let target = null
      for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [5, 5], [-5, -5]]) {
        const g = groundAt(bot, Math.floor(start.x) + dx, Math.floor(start.z) + dz)
        if (g && Math.abs(g.position.y + 1 - start.y) <= 2) { target = g.position.offset(0.5, 1, 0.5); break }
      }
      assert(target, 'no flat-ish spot 6 blocks away to walk to')
      ctx.log(`walking to ${target}`)
      await bot.goto(target, { range: 1.5, timeoutMs: 40_000 })
      await waitFor(() => bot.entity.position.distanceTo(target) <= 2.2, { timeout: 3000, what: 'the bot to settle at the target' })
      assert(bot.entity.position.distanceTo(start) > 3, 'bot did not really move')
    }
  },

  {
    name: 'collect',
    timeout: 60_000,
    async run (bot, ctx) {
      // "добудь / собери": grass_block drops dirt; dirt drops dirt
      const before = count(bot, 'dirt')
      const target = ['grass_block', 'dirt'].find(n => bot.findNearest(n, 16))
      assert(target, 'no grass/dirt within 16 blocks')
      await bot.collect(target, 2)
      await waitFor(() => count(bot, 'dirt') >= before + 1, { timeout: 8000, what: `dirt in the inventory (have ${count(bot, 'dirt')}, had ${before})` })
      ctx.log(`dirt: ${before} -> ${count(bot, 'dirt')}`)
    }
  },

  {
    name: 'mine',
    timeout: 60_000,
    async run (bot) {
      // "накопай": mine() must leave air where the blocks were
      const positions = bot.findAll('dirt', 6, 3).concat(bot.findAll('grass_block', 6, 3)).slice(0, 2)
      assert(positions.length === 2, 'need 2 dirt/grass blocks within 6 blocks')
      const names = positions.map(p => bot.blockAt(p).name)
      for (let i = 0; i < positions.length; i++) {
        await bot.mine(names[i], 1, { maxDistance: 6 })
      }
      const stillThere = positions.filter(p => bot.blockAt(p)?.boundingBox === 'block')
      assert(stillThere.length < positions.length, 'none of the targeted blocks was removed')
    }
  },

  {
    name: 'place',
    timeout: 30_000,
    async run (bot) {
      // "поставь": put a dirt block on the ground 2 blocks away and see it appear
      assert(bot.has('dirt', 1), 'no dirt to place (collect must run first)')
      const p = bot.entity.position
      let ref = null
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const g = groundAt(bot, Math.floor(p.x) + dx, Math.floor(p.z) + dz)
        if (g && g.position.distanceTo(p) <= 4) { ref = g; break }
      }
      assert(ref, 'no reference ground block within reach')
      const expected = ref.position.offset(0, 1, 0)
      const before = count(bot, 'dirt')
      await bot.place('dirt', ref)
      await waitFor(() => bot.blockAt(expected)?.name === 'dirt', { timeout: 4000, what: `dirt at ${expected} (is ${bot.blockAt(expected)?.name})` })
      assert(count(bot, 'dirt') === before - 1, `inventory dirt ${before} -> ${count(bot, 'dirt')}, expected -1`)
    }
  },

  {
    name: 'has-toss',
    timeout: 20_000,
    async run (bot) {
      // "проверь инвентарь / выброси"
      const n = count(bot, 'dirt')
      assert(n >= 1, 'no dirt to toss')
      assert(bot.has('dirt', n) && !bot.has('dirt', n + 1), `has() disagrees with the real count ${n}`)
      assert(!bot.has('netherite_ingot'), 'has("netherite_ingot") is true in a fresh spawn')
      await bot.toss('dirt', 1)
      await waitFor(() => count(bot, 'dirt') === n - 1, { timeout: 5000, what: `dirt count to drop to ${n - 1}` })
      await waitFor(() => bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 4), { timeout: 5000, what: 'the dropped item to appear in the world' })
    }
  },

  {
    name: 'wood-and-craft',
    timeout: 120_000,
    async run (bot, ctx) {
      // "найди дерево, сруби, скрафти": log -> planks -> crafting table
      const log = findAnyLog(bot, 64)
      assert(log, 'no tree within 64 blocks of spawn — cannot test crafting')
      const wood = log.name.replace('_log', '')
      ctx.log(`nearest tree: ${log.name} ${log.d.toFixed(1)} blocks away`)
      const before = count(bot, log.name)
      await bot.collect(log.name, 1, { maxDistance: 64 })
      await waitFor(() => count(bot, log.name) > before, { timeout: 8000, what: `${log.name} in the inventory` })
      await bot.craftSimple(`${wood}_planks`, 1)
      await waitFor(() => bot.has(`${wood}_planks`, 4), { timeout: 5000, what: `4 ${wood}_planks` })
      await bot.craftSimple('crafting_table', 1)
      await waitFor(() => bot.has('crafting_table', 1), { timeout: 5000, what: 'a crafting_table' })
    }
  },

  {
    name: 'goto-player',
    timeout: 60_000,
    async run (bot, ctx) {
      // "доберись до игрока": walk to another bot
      const other = ctx.others.find(o => bot.players[o.username]?.entity)
      assert(other, `none of the other bots is visible to ${bot.username}`)
      await bot.goto(`player:${other.username}`, { range: 2, timeoutMs: 40_000 })
      const dist = bot.entity.position.distanceTo(other.entity.position)
      assert(dist <= 4, `still ${dist.toFixed(1)} blocks away from ${other.username}`)
    }
  },

  {
    name: 'follow',
    timeout: 60_000,
    async run (bot, ctx) {
      // "следуй": follow another bot, catch it, stop
      const other = ctx.others.find(o => bot.players[o.username]?.entity)
      assert(other, 'no visible bot to follow')
      await bot.follow(other.username, { distance: 2 })
      await waitFor(() => bot.entity.position.distanceTo(other.entity.position) <= 3.5, { timeout: 40_000, what: `to catch up with ${other.username}` })
      bot.stop()
      assert(!bot.controlState.forward, 'stop() did not release the controls')
    }
  }
]

/**
 * Not a task — the survival check that runs for the whole session:
 * autoEat is on, the bot keeps busy (walk, dig) and must stay alive and connected.
 */
async function freePlay (bot, ctx, untilMs) {
  bot.autoEat()
  let i = 0
  while (Date.now() < untilMs) {
    if (!bot.entity || ctx.disconnected(bot)) return
    try {
      const p = bot.entity.position
      const angle = (i++ * 137) % 360 * Math.PI / 180
      const g = groundAt(bot, Math.floor(p.x + Math.cos(angle) * 5), Math.floor(p.z + Math.sin(angle) * 5))
      if (g) await bot.goto(g.position.offset(0.5, 1, 0.5), { range: 1.5, timeoutMs: 15_000, sprint: true })
      const n = ['grass_block', 'dirt'].find(x => bot.findNearest(x, 5))
      if (n) await bot.collect(n, 1, { maxDistance: 5 })
    } catch (err) {
      ctx.log(`free play: ${err.message}`)
    }
    await sleep(1000)
  }
}

module.exports = { tasks, freePlay, count, sleep }
