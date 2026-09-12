import { Vec3 } from 'vec3'
import { sleepMs } from './helpers'

/**
 * Ванильное, «человеческое» PvP.
 *
 * Честные правила (так играет настоящий игрок, поэтому античитам не за что зацепиться):
 *  - дальность атаки НЕ больше ванильной (3 блока), по умолчанию держим 2.8
 *  - перед ударом бот СТОИТ (мувфикс: нельзя ехать и крутиться одновременно при ударе)
 *  - бот СНАЧАЛА наводится на цель (плавно, за несколько пакетов), потом бьёт
 *  - между ударами ждём полный кулдаун атаки (~600 мс, как у игрока с мечом)
 *  - крит — только по ванильным правилам: прыжок и удар на падении, спринт выключен
 *
 *   await bot.fight('Steve')               // драка до остановки
 *   await bot.fight('zombie', { crits: true })
 *   bot.stop()                             // выйти из боя
 */

const EYE_HEIGHT = 1.62 // высота глаз игрока

export interface FightOptions {
  /** На какой дистанции стоять в бою (должна быть < ванильной дальности). @default 2.8 */
  range?: number
  /** Жёсткий лимит дальности удара — ванила ломается дальше 3 блоков. @default 3.0 */
  maxReach?: number
  /** Пауза между ударами, мс (полный кулдаун меча). @default 600 */
  attackMs?: number
  /** Прыжковые криты (ванильные: удар на падении без спринта). @default true */
  crits?: boolean
}

/** Плавно навестись на точку: 3 пакета поворота вместо одного резкого снапа. */
async function naturalLookAt(bot: any, target: Vec3): Promise<void> {
  const from = bot.entity.position.offset(0, EYE_HEIGHT, 0)
  const dx = target.x - from.x
  const dy = target.y - from.y
  const dz = target.z - from.z
  const targetYaw = Math.atan2(-dx, -dz)
  const groundDist = Math.sqrt(dx * dx + dz * dz)
  const targetPitch = Math.atan2(dy, groundDist)

  // текущий взгляд
  let yaw = bot.entity.yaw ?? 0
  let pitch = bot.entity.pitch ?? 0
  // кратчайший путь по кругу
  const dyaw = ((targetYaw - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const dpitch = targetPitch - pitch

  const steps = 3
  for (let i = 1; i <= steps; i++) {
    yaw += dyaw / steps
    pitch += dpitch / steps
    try { await bot.look(yaw, pitch) } catch {}
    await sleepMs(25)
  }
}

/** Прыжок одним импульсом (без зависимостей от других модулей). */
function jumpOnce(bot: any): void {
  bot.setControlState('jump', true)
  setTimeout(() => bot.setControlState('jump', false), 300)
}

/** Ждём, пока сервер скажет, что мы в воздухе (для крита). */
async function waitUntilAirborne(bot: any, timeoutMs = 250): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (bot.entity && bot.entity.onGround === false) return true
    await sleepMs(20)
  }
  return bot.entity ? bot.entity.onGround === false : false
}

export function injectPvp(bot: any) {
  const resolveTarget = (target: any): any => {
    if (!target) return null
    if (typeof target !== 'string') return target // уже сущность
    const player = bot.players?.[target]
    if (player?.entity) return player.entity
    const ent = bot.nearestEntity?.((e: any) => e.name === target || e.username === target)
    return ent ?? null
  }

  /**
   * Начать бой с целью (имя игрока/моба или сущность).
   * Возвращает управление когда бой остановлен через bot.stop() или цель пропала.
   */
  bot.fight = async (target: any, options: FightOptions = {}): Promise<void> => {
    const opts = {
      range: options.range ?? 2.8,
      maxReach: options.maxReach ?? 3.0,
      attackMs: options.attackMs ?? 600,
      crits: options.crits ?? true
    }
    const entity = resolveTarget(target)
    if (!entity) throw new Error(`fight target not found: ${target}`)

    const state = { active: true }
    bot._fight = state
    let lastAttack = 0

    try {
      while (state.active && entity.isValid !== false && bot.entity) {
        // если нас откинули — переживаем откат как живой игрок, не нажимая ничего
        const kbLeft = (bot._kbUntil ?? 0) - Date.now()
        if (kbLeft > 0) {
          bot.clearControlStates()
          await sleepMs(kbLeft)
          continue
        }

        const dist = bot.entity.position.distanceTo(entity.position)

        // 1) цель вне дистанции удара — подходим (как игрок: бегом если далеко)
        if (dist > opts.range) {
          if (dist > 4) bot.setControlState('sprint', true)
          try {
            await bot.goto(entity.position, { range: opts.range, timeoutMs: 5000 })
          } catch { /* цель двигается — перегруппируемся на следующем круге */ }
          bot.setControlState('sprint', false)
          await sleepMs(50)
          continue
        }

        // 2) МУВФИКС: стоим на месте, пока целимся и бьём
        bot.clearControlStates()

        // 3) наводимся на грудь цели ПЕРЕД ударом, плавно
        await naturalLookAt(bot, entity.position.offset(0, 1.0, 0))
        if (!state.active) break

        // 4) кулдаун атаки — как у игрока, не спамим пакетами
        const sinceLast = Date.now() - lastAttack
        const jitter = Math.floor(Math.random() * 50) // люди не машины
        const wait = opts.attackMs + jitter - sinceLast
        if (wait > 0) await sleepMs(wait)
        if (!state.active) break

        // 5) ванильный крит: спринт выключен, прыгаем и бьём на падении
        if (opts.crits && bot.entity.onGround) {
          bot.setControlState('sprint', false)
          jumpOnce(bot)
          await waitUntilAirborne(bot)
          if (!state.active) break
        }

        // 6) бьём ТОЛЬКО в пределах ванильной дальности
        const finalDist = bot.entity.position.distanceTo(entity.position)
        if (finalDist <= opts.maxReach) {
          bot.attack(entity)
          lastAttack = Date.now()
        }

        await sleepMs(50) // следующий круг: повторное позиционирование
      }
    } finally {
      if (bot._fight === state) bot._fight = null
      bot.clearControlStates()
    }
  }
}
