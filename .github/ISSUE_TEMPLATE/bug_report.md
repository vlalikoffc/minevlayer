---
name: Bug report
about: Create a report to help us improve minevlayer
title: ''
labels: possible bug
assignees: ''
---

- [ ] This is about the **minevlayer wrapper** (`bot.break`, `bot.goto`, ...). For raw mineflayer bugs, report to [PrismarineJS/mineflayer](https://github.com/PrismarineJS/mineflayer/issues) instead.

## Versions
 - minevlayer: #.#.#
 - minecraft server: vanilla/spigot/paper #.#.#
 - node: #.#.#

## Detailed description
What did you call, what happened, what did you expect? Include the full `[minevlayer]` log output if any.

## Minimal reproduction
```js
const { createBot } = require('minevlayer')

const bot = createBot({ host: 'localhost', username: 'BugBot' })

bot.on('spawn', async () => {
  // your code here
})
```

## Expected behavior

## Additional context
