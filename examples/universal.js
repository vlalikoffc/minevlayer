/**
 * UNIVERSAL — один бот для любого режима: выживание, SMP, анархия, миниигры.
 * Все действия — примитивы одной строкой; специфика режима — ваши пару строк логики.
 */

const { createBot } = require('../dist') // или require('minevlayer') после npm i

const bot = createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3] || '25565'),
  username: 'UniBot'
})

bot.on('spawn', () => {
  // выживаем на любом сервере
  bot.antiAfk()

  console.log(bot.brain.describe())
  bot.brain.reportEvery(5000)
})

// чат-команды — работают в любом режиме
bot.onChat('ломай', async (username) => {
  await bot.dig('oak_log').catch(e => bot.chat(`${username}: ${e.message}`))
})

bot.onChat('ко мне', async (username) => {
  await bot.goto(`player:${username}`).catch(() => bot.chat('Не могу дойти!'))
})

bot.onChat('отдай', async (username) => {
  // "отдай diamond 3"
  const item = bot.inventory.items()[0]
  if (item) await bot.give(username, item.name, 1).catch(e => bot.chat(`${e.message}`))
})

// подбираем дроп вокруг (лут в PvP/бедварсе, дроп после копания)
bot.onChat('подбери', async () => {
  while (await bot.pickup(16)) { /* подбираем пока есть что */ }
  bot.chat('Подобрал всё рядом!')
})

// защищаемся от всего враждебного
bot.brain.on('threat', async (e) => {
  bot.chat(`Ко мне идёт ${e.name}!`)
  await bot.attackNearest(ent => ent.id === e.id)
})

// мозг подсказывает, что делать дальше
bot.on('health', () => {
  const plan = bot.brain.todo()
  if (plan.length > 0) console.log('[план]', plan)
})
