/**
 * HUMAN — бот, физически неотличимый от игрока в официальном клиенте.
 * Живой простой, откат от ударов, вотчдозор физики.
 */

const { createBot } = require('../dist') // или require('minevlayer') после npm i

const bot = createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3] || '25565'),
  username: 'HumanBot'
})

bot.on('spawn', () => {
  // живой простой: дрейф головы, осмотры, приседы, прыжки — как настоящий игрок
  bot.human.idle()
  console.log('Статус:', bot.human.status())
})

// вотчдозор: если бот висит в воздухе невозможно долго — узнаем сразу
bot.on('physics_anomaly', (e) => {
  console.log('[физика] аномалия:', e)
})

// при уроне бот НЕ замирает: физика проигрывает откат, а бот продолжает
// держать свои клавиши — как игрок, который не отпустил W (см. physics.ts)
bot.on('entityHurt', (entity) => {
  if (entity === bot.entity) {
    console.log('[физика] получил урон — откат играет физика, я продолжаю как игрок')
  }
})

// анти-АФК теперь = тот же живой простой
bot.onChat('жди', () => {
  bot.antiAfk()
  bot.chat('Стою, изображаю жизнь')
})
