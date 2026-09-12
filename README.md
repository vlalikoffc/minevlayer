# minevlayer

**Minecraft bots: 1 action = 1 line.** A smart TypeScript layer on top of [Mineflayer](https://github.com/PrismarineJS/mineflayer).

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
await bot.feed() // eat the simplest food from inventory (refuses with a tip if there's none)
await bot.heal() // eat until hunger is full so health regenerates
await bot.sleepNow() // find the nearest bed, walk to it, sleep (clear error if impossible)
await bot.craftChain('iron_pickaxe') // auto-crafts missing ingredients first: planks <- logs, sticks <- planks...
```

`craftChain` walks to a crafting table when the recipe needs one, and tells you
exactly which ingredient it can't get if the chain is impossible.

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
