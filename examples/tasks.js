/**
 * TASKS — бот, которому почти ничего не нужно дописывать.
 * Мозг сам решает, что важнее прямо сейчас: защищаться, копать, собирать лут.
 */

const path = require('path')
const { createBot } = require('../dist') // или require('minevlayer') после npm i

const bot = createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3] || '25565'),
  username: 'TaskBot'
})

bot.on('spawn', () => {
  // стандартные задачи — по одной строке
  bot.tasks.defend() // при угрозе: хп мало -> отступить и лечиться, иначе -> отбиваться
  bot.tasks.mine('oak_log', { count: 8 }) // добыть 8 дуба (потом задача снимется сама)
  bot.tasks.gather() // подбирать дроп вокруг

  // кастомная задача из файла
  bot.tasks.load(path.join(__dirname, 'tasks', 'patrol.js'))

  // мозг поехал
  bot.tasks.start()
  console.log('Задачи:', bot.tasks.list())
})

// наблюдаем за решениями мозга
bot.tasks.on('switch', ({ from, to }) => {
  console.log(`[мозг] ${from ?? '—'} -> ${to ?? 'простаиваю'}`)
})

bot.tasks.on('done', ({ task }) => {
  console.log(`[мозг] задача "${task}" выполнена`)
})

bot.tasks.on('error', ({ task, error }) => {
  console.log(`[мозг] в задаче "${task}" проблема: ${error.message}`)
})

// управление голосом
bot.onChat('стоп', () => {
  bot.tasks.stop()
  bot.chat('Мозг остановлен')
})

bot.onChat('копай ', (username, message) => {
  const block = message.replace('копай ', '').trim()
  bot.tasks.mine(block, { count: 5 })
  bot.tasks.start()
  bot.chat(`Добавил задачу: добыть 5 ${block}`)
})
