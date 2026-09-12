import { sinceKnockback } from './physics'

/**
 * «Человечность»: всё, что делает бота физически неотличимым от игрока
 * в полноценном Java-клиенте.
 *
 * Гарантии слоя:
 *  - движение считается ТОЛЬКО ванильным физическим движком (prismarine-physics):
 *    гравитация, падение, откидывание — как у настоящего клиента;
 *  - бот НИКОГДА не телепортируется и не подменяет координаты;
 *  - откат от удара проигрывает физика, а бот продолжает держать свои клавиши,
 *    как игрок, который не отпустил W (см. physics.ts) — никаких «замираний»;
 *  - в простое бот ведёт себя как человек: дрейф головы, осмотр, присед, прыжок —
 *    а не стоит как статуя с идеально статичной камерой.
 *
 * Вотчдозор: если бот висит в воздухе подозрительно долго (физика не сработала) —
 * событие 'physics_anomaly', чтобы знать о проблеме, а не падать молча.
 *
 *   bot.human.idle()      // включить «живой» простой
 *   bot.human.stopIdle()
 *   bot.human.status()    // { physicsEnabled, onGround, airborneMs, ... }
 */

export interface HumanStatus {
  physicsEnabled: boolean
  onGround: boolean
  /** сколько мс бот в воздухе сейчас (0 если стоит) */
  airborneMs: number
  /** сколько мс назад был откат от урона (0 если его нет/прошёл) */
  sinceKnockbackMs: number
  idleActive: boolean
}

export interface IdleOptions {
  /** минимальная пауза между микродействиями. @default 2500 */
  minMs?: number
  /** максимальная пауза между микродействиями. @default 8000 */
  maxMs?: number
}

/** Как долго можно лететь, прежде чем поднять тревогу (падение со 125+ блоков). */
const AIRBORNE_ALARM_MS = 5000

function rand(from: number, to: number): number {
  return from + Math.random() * (to - from)
}

export function injectHuman(bot: any): void {
  const human = {
    _idleTimer: null as ReturnType<typeof setTimeout> | null,
    _airborneSince: null as number | null,

    status(): HumanStatus {
      return {
        physicsEnabled: bot.physicsEnabled !== false,
        onGround: !!bot.entity?.onGround,
        airborneMs: this._airborneSince ? Date.now() - this._airborneSince : 0,
        sinceKnockbackMs: sinceKnockback(bot),
        idleActive: this._idleTimer !== null
      }
    },

    /**
     * «Живой» простой: случайные микродействия человека у клавиатуры.
     * Веса подобраны под реального игрока: чаще всего — мелкие движения головой.
     */
    idle(options: IdleOptions = {}): void {
      const minMs = options.minMs ?? 2500
      const maxMs = options.maxMs ?? 8000
      this.stopIdle()

      const act = () => {
        if (!bot.entity) return schedule()

        const roll = Math.random()
        const yaw = bot.entity.yaw ?? 0
        const pitch = bot.entity.pitch ?? 0
        if (roll < 0.55) {
          // микро-дрейф головы (как будто следит за чем-то)
          bot.look(yaw + rand(-0.25, 0.25), pitch + rand(-0.1, 0.1)).catch(() => {})
        } else if (roll < 0.75) {
          // осмотреться
          bot.look(yaw + rand(-1.2, 1.2), rand(-0.4, 0.4)).catch(() => {})
        } else if (roll < 0.9) {
          // присесть на секунду
          bot.setControlState('sneak', true)
          setTimeout(() => bot.setControlState('sneak', false), 700)
        } else if (bot.entity.onGround) {
          // одиночный прыжок на месте
          bot.setControlState('jump', true)
          setTimeout(() => bot.setControlState('jump', false), 300)
        }
        schedule()
      }

      const schedule = () => {
        if (this._idleTimer === null && this._stopped) return
        this._idleTimer = setTimeout(() => {
          this._idleTimer = null
          if (this._stopped) return
          act()
        }, rand(minMs, maxMs))
      }

      this._stopped = false
      schedule()
    },

    stopIdle(): void {
      this._stopped = true
      if (this._idleTimer) {
        clearTimeout(this._idleTimer)
        this._idleTimer = null
      }
    },

    _stopped: false,
    _alarmFired: false
  }

  bot.human = human

  // Вотчдозор полёта: физика обязана приземлять. Если висим слишком долго —
  // что-то пошло не так (например, физику выключили) — сообщаем прямо в полёте.
  bot.on('physicsTick', () => {
    const onGround = !!bot.entity?.onGround
    if (!onGround) {
      if (!human._airborneSince) {
        human._airborneSince = Date.now()
      } else if (!human._alarmFired && Date.now() - human._airborneSince > AIRBORNE_ALARM_MS) {
        human._alarmFired = true
        bot.emit('physics_anomaly', { reason: 'airborne_too_long', ms: Date.now() - human._airborneSince })
      }
    } else {
      human._airborneSince = null
      human._alarmFired = false
    }
  })
}
