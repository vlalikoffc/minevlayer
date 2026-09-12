/**
 * BRAIN — мозг бота: состояние и обстановка в реальном времени.
 * Ни одной ручной подписки на пакеты — всё через bot.brain.
 */

const { createBot } = require('../dist') // или require('minevlayer') после npm i

const bot = createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3] || '25565'),
  username: 'BrainBot'
})

bot.on('spawn', () => {
  // 1 строка — полный снимок состояния
  console.log(bot.brain.state())

  // 1 строка — человекочитаемый статус
  console.log(bot.brain.describe())

  // печатать статус в консоль каждые 2 секунды
  bot.brain.reportEvery(2000)

  // кто вокруг (отсортировано по расстоянию)
  for (const e of bot.brain.nearby(16)) {
    console.log(`  рядом: ${e.name} (${e.kind}) в ${e.distance.toFixed(1)} блоках`)
  }
})

// события мозга
bot.brain.on('threat', (e) => {
  bot.chat(`Вижу ${e.name} в ${e.distance.toFixed(1)} блоках!`)
})

bot.brain.on('danger_hp', (hp) => {
  bot.chat(`У меня ${hp} HP, отступаю!`)
  bot.autoEat()
})

bot.brain.on('hungry', () => {
  bot.autoEat()
})

bot.brain.on('playerJoined', (name) => {
  bot.chat(`Привет, ${name}!`)
})

bot.brain.on('death', () => {
  console.log('Я умер. Респавн...')
})
