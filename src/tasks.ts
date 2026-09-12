import { EventEmitter } from 'events'
import type { Vec3 } from 'vec3'

/**
 * Мозг-диспетчер: очередь задач с приоритетами.
 *
 * Задача — это «что делать прямо сейчас». Каждые ~500 мс мозг выбирает
 * АВТОРИТЕТНЕЙШУЮ задачу из активных и выполняет ОДИН её шаг. Высокий
 * приоритет (защита) прерывает низкий (добыча) автоматически.
 *
 *   bot.tasks.defend()                    // стандартная: защита
 *   bot.tasks.mine('diamond_ore', { count: 10 })
 *   bot.tasks.attack('Steve')
 *   bot.tasks.gather()                    // подбирать дроп
 *   bot.tasks.custom({ name, priority, active, run })  // своя задача
 *   bot.tasks.load('./tasks/patrol.js')   // своя задача из файла
 *   bot.tasks.start(); bot.tasks.stop()
 *   bot.tasks.current                     // что делаем сейчас
 *
 * Файл кастомной задачи:
 *   module.exports = { name: 'patrol', priority: 30, run: async (bot) => { ... } }
 */

export interface TaskDef {
  /** Имя задачи (уникальное; повторный add заменяет). */
  name: string
  /** Чем больше — тем авторитетнее. Защита 90, атака 80, добыча 50, сбор 40. */
  priority: number
  /** Активна ли задача сейчас. Если не задано — активна всегда. */
  active?: (bot: any) => boolean
  /** Один шаг задачи. Вызывается снова и снова, пока задача активна. */
  run: (bot: any) => Promise<void> | void
}

const DEFAULT_PRIORITIES = { defend: 90, attack: 80, mine: 50, gather: 40 }

/** Одиночный «человеческий» удар для задач (с кулдауном и прицелом). */
async function swingOnce(bot: any, entity: any): Promise<boolean> {
  if ((bot._kbUntil ?? 0) > Date.now()) return false
  const dist = bot.entity?.position?.distanceTo(entity.position) ?? 999
  if (dist > 3) return false // ванильная дальность
  try { await bot.lookAt(entity.position.offset(0, 1, 0)) } catch {}
  const now = Date.now()
  if (now - (bot._lastSwing ?? 0) < 600) return false
  bot._lastSwing = now
  bot.attack(entity)
  return true
}

export class TaskManager extends EventEmitter {
  current: string | null = null

  private bot: any
  private tasks: TaskDef[] = []
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(bot: any) {
    super()
    this.bot = bot
  }

  // ==================== реестр задач ====================

  /** Добавить задачу (с тем же именем — заменить). */
  add(def: TaskDef): TaskDef {
    this.remove(def.name)
    this.tasks.push(def)
    this.tasks.sort((a, b) => b.priority - a.priority)
    return def
  }

  remove(name: string): void {
    this.tasks = this.tasks.filter(t => t.name !== name)
    if (this.current === name) this.current = null
  }

  list(): Array<{ name: string, priority: number, active: boolean }> {
    return this.tasks.map(t => ({
      name: t.name,
      priority: t.priority,
      active: t.active ? !!t.active(this.bot) : true
    }))
  }

  get(name: string): TaskDef | undefined {
    return this.tasks.find(t => t.name === name)
  }

  /** Загрузить кастомную задачу из файла (или папки с индексом). */
  load(file: string): TaskDef {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file)
    const def: TaskDef = typeof mod === 'function' ? mod(this.bot) : mod
    if (!def || typeof def.run !== 'function' || !def.name) {
      throw new Error(`Task file ${file} must export { name, priority?, active?, run }`)
    }
    return this.add(def)
  }

  // ==================== стандартные задачи ====================

  /** Защита: при низком ХП отступать и лечиться, иначе — отбиваться от угроз. */
  defend(options: { retreatHp?: number } = {}): TaskDef {
    const retreatHp = options.retreatHp ?? 6
    return this.add({
      name: 'defend',
      priority: DEFAULT_PRIORITIES.defend,
      active: (bot) => {
        const hp = bot.health ?? 20
        const unsafe = bot.brain ? !bot.brain.isSafe() : false
        return hp <= retreatHp || unsafe
      },
      run: async (bot) => {
        const hp = bot.health ?? 20
        const threat = bot.brain?.threats ? bot.brain.threats()[0] : null
        if (hp <= retreatHp) {
          // отходим от ближайшей угрозы и лечимся
          if (threat && bot.entity?.position) {
            const away = bot.entity.position.plus(
              bot.entity.position.minus(threat.position).normalize().scaled(10)
            )
            await bot.goto(away, { range: 3, timeoutMs: 4000 }).catch(() => {})
          }
          await bot.feed?.().catch(() => {})
        } else if (threat) {
          const dist = bot.entity?.position?.distanceTo(threat.position) ?? 999
          if (dist > 2.8) {
            await bot.goto(threat.position, { range: 2.5, timeoutMs: 4000 }).catch(() => {})
          } else {
            await swingOnce(bot, threat)
          }
        }
      }
    })
  }

  /** Добыча: блоков по имени с условиями (сколько, радиус). */
  mine(blockName: string, options: { count?: number, maxDistance?: number, priority?: number } = {}): TaskDef {
    let remaining = options.count ?? 1
    const name = `mine:${blockName}`
    const def: TaskDef = {
      name,
      priority: options.priority ?? DEFAULT_PRIORITIES.mine,
      active: () => remaining > 0,
      run: async (bot) => {
        try {
          await bot.mine(blockName, 1, { maxDistance: options.maxDistance })
          remaining--
        } catch (e) {
          remaining = 0 // не можем добыть — не долбимся бесконечно
          this.emit('error', { task: name, error: e })
        }
        if (remaining <= 0) {
          this.emit('done', { task: name })
          this.remove(name)
        }
      }
    }
    return this.add(def)
  }

  /** Атака конкретной цели (ник или имя моба), пока цель существует. */
  attack(target: string, options: { priority?: number } = {}): TaskDef {
    const name = `attack:${target}`
    const def: TaskDef = {
      name,
      priority: options.priority ?? DEFAULT_PRIORITIES.attack,
      active: (bot) => {
        const player = bot.players?.[target]
        if (player?.entity) return true
        return !!bot.nearestEntity?.((e: any) => e.name === target || e.username === target)
      },
      run: async (bot) => {
        const player = bot.players?.[target]
        const entity = player?.entity ?? bot.nearestEntity?.((e: any) => e.name === target || e.username === target)
        if (!entity) return
        const dist = bot.entity?.position?.distanceTo(entity.position) ?? 999
        if (dist > 2.8) {
          await bot.goto(entity.position, { range: 2.5, timeoutMs: 4000 }).catch(() => {})
        } else {
          await swingOnce(bot, entity)
        }
      }
    }
    return this.add(def)
  }

  /** Сбор: подбирать дроп вокруг (лут, еда, ресурсы). */
  gather(options: { count?: number, priority?: number } = {}): TaskDef {
    let remaining = options.count ?? Number.MAX_SAFE_INTEGER
    const def: TaskDef = {
      name: 'gather',
      priority: options.priority ?? DEFAULT_PRIORITIES.gather,
      active: () => remaining > 0,
      run: async (bot) => {
        const got = await bot.pickup?.(16).catch(() => null)
        if (got) {
          remaining--
          if (remaining <= 0) {
            this.emit('done', { task: 'gather' })
            this.remove('gather')
          }
        }
      }
    }
    return this.add(def)
  }

  /** Своя задача в одну строку. */
  custom(def: TaskDef): TaskDef {
    return this.add(def)
  }

  // ==================== диспетчер ====================

  /** Запустить цикл мозга. */
  start(intervalMs = 500): void {
    if (this.running) return
    this.running = true
    const step = async () => {
      if (!this.running) return
      const task = this.tasks.find(t => (t.active ? !!t.active(this.bot) : true))
      if ((task?.name ?? null) !== this.current) {
        const from = this.current
        this.current = task?.name ?? null
        try { this.bot.stop?.() } catch {} // новая задача — сброс старых действий
        this.emit('switch', { from, to: this.current })
      }
      if (task) {
        try { await task.run(this.bot) } catch (e) {
          this.emit('error', { task: task.name, error: e })
        }
      }
      if (this.running) this.timer = setTimeout(step, intervalMs)
    }
    step()
  }

  /** Остановить мозг и все действия. */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.current = null
    try { this.bot.stop?.() } catch {}
  }
}
