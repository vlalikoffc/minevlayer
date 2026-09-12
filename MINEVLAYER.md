# minevlayer — Minecraft bots in one line

> **Mineflayer stays under the hood (JS, `vendor/mineflayer`). Minevlayer is a TypeScript wrapper on top that makes bot code 70× shorter.**
> Build a capable bot in an hour — even if you've never coded before.

[![npm version](https://img.shields.io/npm/v/minevlayer.svg?color=success&label=npm&logo=npm)](https://www.npmjs.com/package/minevlayer)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![minecraft](https://img.shields.io/badge/minecraft-1.8--26.1-blue)](https://github.com/PrismarineJS/mineflayer)

**Looking for the underlying engine?** Minevlayer wraps [PrismarineJS/mineflayer](https://github.com/PrismarineJS/mineflayer). All Mineflayer APIs remain available.

---

## Why minevlayer?

Mineflayer is powerful but verbose. A simple "find oak log → walk → equip best tool → dig" takes 20 lines, pathfinder setup, inventory loops, and version quirks.

Minevlayer keeps all that power and adds a one-line layer:

| Task | Mineflayer (before) | Minevlayer (now) |
|------|---------------------|------------------|
| Break nearest oak log | 15–20 lines: `findBlock` + `Movements` + `GoalNear` + tool search + `equip` + `dig` | `await bot.break("oak_log")` |
| Mine 5 stones | Loop + error handling + re-find | `await bot.mine("stone", 5)` |
| Go to player | `pathfinder.setMovements` + `GoalFollow` | `await bot.goto("player:Notch")` |
| Follow player | `GoalFollow` + interval | `await bot.follow("Notch")` |
| Check inventory | Manual slot scan | `bot.has("bread", 10)` |

With pathfinder/collectblock/pvp installed, navigation and collection become smart automatically. Without them, minevlayer falls back to a simple built-in walker.

---

## Installation

```bash
npm install minevlayer
# optional but recommended for smart movement/collection/combat:
npm install mineflayer-pathfinder mineflayer-collectblock mineflayer-pvp
```

Requires Node.js >= 22.

---

## Quick start

### JavaScript — 7 lines

```js
const { createBot } = require('minevlayer')

const bot = createBot({ host: 'localhost', username: 'VlBot' })

bot.on('spawn', async () => {
  await bot.break("oak_log") // find → walk → equip → dig
  bot.chat("Done! One line was enough.")
})
```

### TypeScript — with autocomplete

```ts
import { createBot } from 'minevlayer'

const bot = createBot({ host: 'localhost', username: 'VlBot' })

bot.on('spawn', async () => {
  await bot.mine("stone", 5)
  await bot.goto({ x: 100, y: 64, z: 200 })
  console.log(bot.has("stone", 5)) // true
})
```

Run:

```bash
npm run build
node examples/ultra_simple.js
# or
npx ts-node examples/ultra_simple_ts.ts
```

See `examples/ultra_simple.js` and `examples/ultra_simple_ts.ts` for full bots.

---

## API (the simple layer)

All methods are on the bot returned by `minevlayer.createBot()`. The original Mineflayer bot API is still there — this is additive.

```ts
// mining & collection
await bot.break("oak_log", { maxDistance: 64, autoTool: true })
await bot.mine("diamond_ore", 3)
await bot.collect("diamond_ore", 3) // uses collectblock if available

// movement
await bot.goto({ x: 100, y: 64, z: -50 })
await bot.goto("player:Notch")
await bot.goto("chest") // goes to nearest chest
await bot.follow("Notch", { distance: 2 })
bot.stop()

// inventory
await bot.equipBest("oak_log") // or block object
bot.has("bread", 10) // boolean
await bot.toss("dirt", 64)
await bot.place("chest") // places in front of you
await bot.craftSimple("stick", 4)

// chat & control
bot.onChat("hello", (username) => bot.chat(`hi ${username}!`))
bot.when("health", () => console.log(bot.health))
await bot.wait(20) // 20 ticks
bot.say("let's go", 1000) // with delay

// helpers
bot.findNearest("chest", 32)
bot.findAll("stone", 64, 10)

// smart behaviors (auto-use plugins if present)
bot.autoEat()
bot.guard({ x: 0, y: 64, z: 0 }, 15)
```

Need low level? Use the vendor core directly:

```ts
import { mineflayerCore } from 'minevlayer'
const rawBot = mineflayerCore.createBot({ host: 'localhost', username: 'Raw' })
rawBot.findBlock(...)
rawBot.dig(...)

// or directly:
const vendor = require('./vendor/mineflayer')
const rawBot2 = vendor.createBot(...)
```

---

## Architecture — Vendor + Wrapper (clean separation)

```
minevlayer/
├── vendor/mineflayer/   # vendor: original PrismarineJS/mineflayer (JS, untouched)
│   ├── index.js         # vendor entry
│   ├── index.d.ts       # vendor types
│   └── lib/             # 40 plugins, loader, physics, etc.
├── src/                 # wrapper: TypeScript layer you maintain
│   ├── index.ts         # createBot() — imports from vendor/mineflayer
│   ├── simple.ts        # simple methods (break/mine/goto...)
│   ├── helpers.ts
│   └── types.ts         # MinevlayerBot
├── dist/                # build output (npm run build)
├── index.js / index.d.ts # root re-exports vendor for backward compat
├── examples/
│   ├── ultra_simple.js
│   └── ultra_simple_ts.ts
└── README.md            # this file
```

- **True wrapper** — vendor is isolated in `vendor/mineflayer/`, never edited. Wrapper only imports it.
- **No rewrite** — `lib/` no longer exists at root; all original code lives in vendor.
- **One install** — `npm install minevlayer` gives both layers.
- **One install** — `npm install minevlayer` gives everything.

---

## What belongs to whom

| Layer | Source | Language | License |
|-------|--------|----------|---------|
| Mineflayer core (`vendor/mineflayer/`) | `PrismarineJS/mineflayer` | JavaScript | MIT (Andrew Kelley & PrismarineJS contributors) |
| Minevlayer wrapper (`src/`, `examples/`, `dist/`) | `vlalikoffc/minevlayer` | TypeScript | MIT (vlalikoffc) |

Minevlayer is **not affiliated** with PrismarineJS. It is a community wrapper that makes the original work more accessible.

---

## Attribution & License

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE).

You must keep the MIT notice from both projects:

- **Mineflayer**: Copyright (c) 2015 Andrew Kelley, PrismarineJS contributors — https://github.com/PrismarineJS/mineflayer
- **Minevlayer wrapper**: Copyright (c) 2026 vlalikoffc — https://github.com/vlalikoffc/minevlayer

If you fork or publish, retain the `LICENSE` file and mention both upstreams. Attribution example for your own fork:

> Built on [PrismarineJS/mineflayer](https://github.com/PrismarineJS/mineflayer) (MIT) with [minevlayer](https://github.com/vlalikoffc/minevlayer) wrapper (MIT).

---

## Contributing

PRs welcome. Keep `vendor/mineflayer/` in sync with upstream when possible, add sugar in `src/`.

```bash
npm install
npm run build
npm test
npm run lint
```

---

## Links

- Wrapper repo: https://github.com/vlalikoffc/minevlayer
- Upstream engine: https://github.com/PrismarineJS/mineflayer
- Mineflayer docs: https://prismarinejs.github.io/mineflayer/
