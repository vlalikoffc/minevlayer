# minevlayer

**Minecraft bots: 1 action = 1 line.** A smart TypeScript layer on top of [Mineflayer](https://github.com/PrismarineJS/mineflayer).
Survival, SMP, anarchy, bedwars, any minigame — the same simple API, because every mode needs the same things: move, fight, use items, talk, interact.

```js
const { createBot } = require('minevlayer')

const bot = createBot({ host: 'localhost', username: 'VlBot' })

bot.on('spawn', async () => {
  await bot.break('oak_log') // find -> walk -> equip best tool -> dig
})
```

Mineflayer is a great engine but a complex one: verbose API, easy to get lost,
errors without context. minevlayer does not try to fix the engine — it adds a
simple layer on top:

- **Automatic actions take 1 line** (`bot.break`, `bot.mine`, `bot.goto`, `bot.follow`, `bot.collect`).
- **Non-automatic actions take a few explicit lines** — the full Mineflayer API stays on the same bot object.
- **Concrete logs**: `[minevlayer] kicked: ...`, `error:` with stack, `connection ended: ...` — no silent deaths.

## Repo layout

| Path | What it is |
|---|---|
| `src/` | minevlayer — the wrapper. TypeScript, all of our code lives here. |
| `dist/` | build output (`npm run build`), not committed. |
| `vendor/mineflayer/` | **Unmodified** Mineflayer 4.39.0 (code, docs, examples, tests). Connected as a dependency: `"mineflayer": "file:vendor/mineflayer"`. |
| `examples/` | minevlayer examples. |
| `test/unit/` | unit tests of the wrapper (no Minecraft server needed). |

Rules of the repo: the engine in `vendor/` is never edited — upstream develops it
in JS, we only re-vendor new releases. All our changes live in `src/`.

## Install

```bash
npm install minevlayer

# optional, but recommended — minevlayer picks these up automatically if present:
npm install mineflayer-pathfinder mineflayer-collectblock mineflayer-pvp
```

Requires Node.js >= 22.

## API cheat sheet

| Task | Code |
|---|---|
| Break nearest oak log | `await bot.break('oak_log')` |
| Dig diamond ore (smart) | `await bot.dig('diamond_ore')` |
| Mine 5 stones | `await bot.mine('stone', 5)` |
| Break + collect drops | `await bot.collect('diamond_ore', 3)` |
| Go to coordinates | `await bot.goto({ x: 100, y: 64, z: 200 })` |
| Go to player / block | `await bot.goto('player:Notch')` / `await bot.goto('chest')` |
| Follow a player | `await bot.follow('Notch')` |
| Stop everything | `bot.stop()` |
| Place a block | `await bot.place('cobblestone')` |
| Check inventory | `bot.has('bread', 10)` |
| Toss items | `await bot.toss('dirt', 32)` |
| Craft | `await bot.craftSimple('stick', 4)` |
| Chat trigger | `bot.onChat('hi', (user, msg) => ...)` |
| Guard a spot | `bot.guard({ x, y, z }, 15)` |
| Eat automatically | `bot.autoEat()` |
| Find blocks | `bot.findNearest('iron_ore')`, `bot.findAll('iron_ore', 64, 10)` |
| Full state snapshot | `bot.brain.state()` |
| Who's around | `bot.brain.nearby(16)` / `bot.brain.threats()` |
| Live status line | `bot.brain.reportEvery(1000)` |
| What should I do to survive | `bot.brain.todo()` |
| Eat / heal / sleep | `bot.feed()` / `bot.heal()` / `bot.sleepNow()` |
| Craft with full chain | `await bot.craftChain('iron_pickaxe')` |
| Use doors/levers/chests | `await bot.use('chest')` |
| Attack / pickup / give | `bot.attackNearest('zombie')` / `bot.pickup()` / `bot.give('Steve', 'diamond', 2)` |
| Don't get AFK-kicked | `bot.antiAfk()` |
| Proper PvP (crits, cooldown, reach) | `await bot.fight('Steve')` |
| Give the brain a job | `bot.tasks.mine('diamond_ore', { count: 10 })` + `bot.tasks.start()` |
| Self-defense mode | `bot.tasks.defend()` |
| Custom task from a file | `bot.tasks.load('./tasks/patrol.js')` |

Options everywhere: `bot.break('stone', { maxDistance: 32, count: 5, autoTool: true })`.

## Brain — the bot's mind, realtime

In raw mineflayer, knowing "what's happening around me" means dozens of event
subscriptions. With minevlayer it's one object, always up to date:

```js
bot.brain.state() // { hp, food, position, dimension, xp, heldItem, threatsNearby, ... }
bot.brain.describe() // "HP 14/20 | food 18/20 | 10 64 -20 | overworld | players: 2 | threats: 1"
bot.brain.reportEvery(1000) // print state to the console every second

bot.brain.nearby(16) // everyone around, closest first
bot.brain.threats() // hostile mobs within threat radius
bot.brain.isSafe() // no hostiles around?
bot.brain.who('Steve') // find by name

// events
bot.brain.on('threat', (e) => bot.chat(`${e.name} at ${e.distance.toFixed(1)} blocks!`))
bot.brain.on('danger_hp', (hp) => bot.autoEat())
bot.brain.on('playerJoined', (name) => bot.chat(`Hi ${name}!`))
```

Events: `health`, `danger_hp`, `hungry`, `threat`, `entity`, `playerJoined`, `playerLeft`, `death`.

Survival awareness — the brain knows what a living bot should want:

```js
bot.brain.isNight() // time to sleep / hide
bot.brain.tools() // durability report: [{ name: 'iron_pickaxe', durability: 0.04 }, ...]
bot.brain.todo() // ['eat', 'heal', 'fight_or_flee', 'sleep', 'replace_tool'] — empty when life is good
```

## Life — basic needs in one line

The bot is adapted for survival, not just mining:

```js
bot.on('spawn', async () => {
  await bot.feed() // eat the simplest food from inventory (refuses with a tip if there's none)
  await bot.heal() // eat until hunger is full so health regenerates
  await bot.sleepNow() // find the nearest bed, walk to it, sleep (clear error if impossible)
  await bot.craftChain('iron_pickaxe') // auto-crafts missing ingredients first: planks <- logs, sticks <- planks...
})
```

`craftChain` walks to a crafting table when the recipe needs one, and tells you
exactly which ingredient it can't get if the chain is impossible.

## Any game mode

The primitives above are mode-agnostic. On top of them, common scenarios in any mode:

```js
bot.on('spawn', async () => {
  await bot.use('chest') // doors, levers, buttons, chests, tables — walk + activate
  await bot.attackNearest('zombie') // or 'player', 'Steve', or a predicate
  await bot.pickup() // walk to the nearest drop so it gets collected
  await bot.give('Steve', 'diamond', 2) // walk up and toss items to the player
  bot.antiAfk() // random jumps/sneaks/looks — no AFK kick (anarchy servers)
  console.log(bot.brain.droppedItems()) // loot radar: everything dropped nearby
})
```

Game-specific knowledge (bedwars islands and shops, kits, arena logic) is not
hardcoded in the core — it belongs in mode modules built on these primitives,
while the full Mineflayer API stays on the bot for anything exotic.

## PvP and movement — like a real player

The bot plays by vanilla rules, so its behavior looks human instead of cheaty:

```js
bot.on('spawn', async () => {
  await bot.fight('Steve') // proper fight until bot.stop()
})
```

What `fight()` actually does (and why each item matters):

- **Vanilla reach only** — never attacks beyond 3 blocks (default combat distance is 2.8), so no "hit from far away" flags.
- **Movement fix** — the bot stands still while aiming and attacking; no moving-and-snapping at the same time.
- **Aims first, then hits** — rotation is smoothed over a few packets instead of one instant snap.
- **Full attack cooldown** (~600 ms + human jitter) between swings — no packet spam.
- **Real jump crits** — sprint off, jump, hit on the way down, exactly like the vanilla crit rules.
- **Sprint only while repositioning**, natural pathing with no teleports or impossible speeds — movement comes from the vanilla physics engine.

Options: `bot.fight('zombie', { crits: true, range: 2.8, attackMs: 600 })`. Stop with `bot.stop()`.

## Physics — the bot obeys the game

Classic mineflayer bots get kicked because they ignore physics: knocked back but
still pushing "forward", standing in mid-air, impossible packets. minevlayer
plays it straight:

- got hit/knockback → the bot releases all controls for ~350 ms and lets the physics engine play the knock out, exactly like a human would;
- combat and walking pause their inputs during that window;
- no teleports, no impossible speeds — only vanilla physics and vanilla reach.

## Tasks — the brain decides what to do now

`bot.tasks` is a priority dispatcher: every ~500 ms the brain picks the most
authoritative **active** task and does one step of it. A high-priority task
(defense) interrupts a low one (mining) automatically — you just declare tasks.

```js
bot.on('spawn', () => {
  bot.tasks.defend() // standard: retreat+heal at low hp, fight threats otherwise (priority 90)
  bot.tasks.mine('diamond_ore', { count: 10 }) // standard: mine with conditions (priority 50)
  bot.tasks.attack('Steve') // standard: attack a target while it exists (priority 80)
  bot.tasks.gather() // standard: pick up drops around (priority 40)
  bot.tasks.start()
})
```

Custom tasks — inline or from a file:

```js
bot.tasks.custom({
  name: 'night_watch',
  priority: 70,
  active: (bot) => bot.brain.isNight(),
  run: async (bot) => { /* one step */ }
})

bot.tasks.load('./tasks/patrol.js') // file exports { name, priority, active?, run }
```

`bot.tasks.current` — what the bot is doing now; `bot.tasks.list()` — the whole
queue; events: `switch`, `done`, `error`. `bot.tasks.stop()` stops the brain.

How the smarts work:

- **Tool gating.** `bot.dig('diamond_ore')` refuses to dig if you don't have a tool that actually yields drops (diamond ore = iron pickaxe or better — gold doesn't count, checked from game data for any version). The error tells you exactly what's needed and what you have. Force it with `{ force: true }` if you know better.
- **Obstacles.** With `mineflayer-pathfinder` installed, the bot digs/bridges through the path automatically; without it, the naive walker jumps 1-block steps and digs 2-block walls.
- Default count is always **1 block** unless you say otherwise: `bot.mine('stone', 5)`.
- With `mineflayer-pathfinder` installed, `goto`/`follow` use real pathfinding; without it, a built-in naive walker (flat terrain only).
- With `mineflayer-collectblock`, `collect()` breaks and picks up drops properly; without it, it mines and waits for drops.
- Errors tell you what to do: `goto timeout ... Tip: install mineflayer-pathfinder`.

Everything else is plain Mineflayer: `bot.chat`, `bot.inventory`, `bot.on('death', ...)`, plugins, etc.

## Development

```bash
npm install
npm run build     # compile src/ -> dist/
npm test          # lint + build + unit tests of the wrapper
npm run test:vendor   # full mineflayer suite against real Minecraft servers (needs Java)
```

Re-vendoring a new mineflayer release: see `vendor/mineflayer/README.md`.

## License

MIT. minevlayer © vlalikoffc; the vendored engine © Andrew Kelley / PrismarineJS contributors (MIT, see `vendor/mineflayer/LICENSE`).

[![npm version](https://img.shields.io/npm/v/minevlayer.svg?color=success&label=npm&logo=npm)](https://www.npmjs.com/package/minevlayer)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
