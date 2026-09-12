import type { Vec3 } from 'vec3'

/**
 * Brain — «мозг» бота: состояние и обстановка в реальном времени, одной строкой.
 *
 * Вместо тысячи строк подписок на события майнфлеера:
 *   bot.brain.state()        // хп, голод, позиция, мир, опыт, предметы...
 *   bot.brain.describe()     // "HP 14/20 | food 18/20 | players: 2 | threats: 1"
 *   bot.brain.nearby()       // кто вокруг, отсортировано по расстоянию
 *   bot.brain.threats()      // враждебные мобы рядом
 *   bot.brain.on('threat', ...)  // события мозга
 */

/** Общеизвестные враждебные мобы (остальные определяются по данным версии). */
export const HOSTILE_MOBS = new Set([
  'zombie', 'husk', 'drowned', 'zombie_villager',
  'skeleton', 'stray', 'wither_skeleton', 'bogged',
  'creeper', 'spider', 'cave_spider', 'witch',
  'slime', 'magma_cube', 'silverfish', 'endermite',
  'blaze', 'ghast', 'phantom', 'guardian', 'elder_guardian',
  'pillager', 'vindicator', 'ravager', 'evoker', 'vex', 'illusioner',
  'piglin_brute', 'hoglin', 'zoglin', 'shulker', 'warden', 'breeze'
])

export interface EntityInfo {
  id: number
  /** 'player' | 'mob' | 'other' */
  kind: string
  /** ник игрока или имя моба (например 'zombie') */
  name: string
  position: Vec3
  /** расстояние до бота в блоках */
  distance: number
  isHostile: boolean
}

export interface BrainState {
  hp: number
  food: number
  saturation: number
  position: { x: number, y: number, z: number } | null
  dimension: string
  gameMode: string
  isOnGround: boolean
  /** игровое время 0..24000 */
  timeOfDay: number
  isRaining: boolean
  xp: { points: number, progress: number, level: number } | null
  heldItem: string | null
  inventoryCount: number
  playersNearby: number
  threatsNearby: number
}

export type BrainEvents = {
  /** изменилось здоровье/голод: { hp, food, prev } */
  health: { hp: number, food: number, prev: { hp: number, food: number } }
  /** хп упало до критических значений (<=6) */
  danger_hp: number
  /** голод упал до критических значений (<=6) */
  hungry: number
  /** рядом появился враждебный моб */
  threat: EntityInfo
  /** рядом появилось любое существо */
  entity: EntityInfo
  /** игрок зашёл на сервер */
  playerJoined: string
  /** игрок вышел */
  playerLeft: string
  /** бот умер */
  death: undefined
}

export class Brain {
  /** радиус, в котором враждебные мобы считаются угрозой */
  threatRadius = 16

  private bot: any
  private lastHp: number
  private lastFood: number
  private handlers: { [event: string]: Array<(...args: any[]) => void> } = {}
  private reportTimer: ReturnType<typeof setInterval> | null = null

  constructor(bot: any) {
    this.bot = bot
    this.lastHp = bot.health ?? 20
    this.lastFood = bot.food ?? 20
    this.wire()
  }

  // ==================== 1 строка — полный снимок ====================

  state(): BrainState {
    const bot = this.bot
    const pos = bot.entity?.position
    return {
      hp: bot.health ?? 20,
      food: bot.food ?? 20,
      saturation: bot.foodSaturation ?? 0,
      position: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
      dimension: bot.game?.dimension ?? 'unknown',
      gameMode: bot.game?.gameMode ?? 'unknown',
      isOnGround: !!bot.entity?.onGround,
      timeOfDay: bot.time?.timeOfDay ?? 0,
      isRaining: !!bot.isRaining,
      xp: bot.experience
        ? { points: bot.experience.points, progress: bot.experience.progress, level: bot.experience.level }
        : null,
      heldItem: bot.heldItem?.name ?? null,
      inventoryCount: bot.inventory?.items ? bot.inventory.items().length : 0,
      playersNearby: this.players().length,
      threatsNearby: this.threats().length
    }
  }

  /** Человекочитаемая строка состояния. */
  describe(): string {
    const s = this.state()
    const p = s.position ? `${s.position.x.toFixed(0)} ${s.position.y.toFixed(0)} ${s.position.z.toFixed(0)}` : '?'
    return `HP ${s.hp}/20 | food ${s.food}/20 | ${p} | ${s.dimension} | players: ${s.playersNearby} | threats: ${s.threatsNearby}`
  }

  /** Печатать состояние каждые ms миллисекунд (реальное время в консоли). */
  reportEvery(ms = 1000, log: (line: string) => void = (line) => console.log('[brain]', line)): void {
    this.stopReporting()
    this.reportTimer = setInterval(() => log(this.describe()), ms)
  }

  stopReporting(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
      this.reportTimer = null
    }
  }

  // ==================== кто вокруг ====================

  /** Все существа в радиусе, отсортированные по расстоянию (ближайший первым). */
  nearby(radius = 16): EntityInfo[] {
    const bot = this.bot
    if (!bot.entity?.position || !bot.entities) return []
    const out: EntityInfo[] = []
    for (const entity of Object.values<any>(bot.entities)) {
      if (!entity || entity === bot.entity || entity.id === bot.entity.id) continue
      const info = this.describeEntity(entity)
      if (info && info.distance <= radius) out.push(info)
    }
    return out.sort((a, b) => a.distance - b.distance)
  }

  players(radius = 16): EntityInfo[] {
    return this.nearby(radius).filter(e => e.kind === 'player')
  }

  mobs(radius = 16): EntityInfo[] {
    return this.nearby(radius).filter(e => e.kind === 'mob')
  }

  /** Враждебные мобы в радиусе угрозы. */
  threats(radius = this.threatRadius): EntityInfo[] {
    return this.mobs(radius).filter(e => e.isHostile)
  }

  nearestPlayer(radius = 64): EntityInfo | null {
    return this.players(radius)[0] ?? null
  }

  /** Найти по нику/имени среди всех вокруг. */
  who(name: string): EntityInfo | null {
    const needle = String(name).toLowerCase()
    return this.nearby(Number.MAX_SAFE_INTEGER).find(e => e.name.toLowerCase() === needle) ?? null
  }

  /** Нет ли враждебных мобов рядом. */
  isSafe(radius = this.threatRadius): boolean {
    return this.threats(radius).length === 0
  }

  // ==================== события ====================

  on <K extends keyof BrainEvents>(event: K, cb: (payload: BrainEvents[K]) => void): void {
    ;(this.handlers[event] = this.handlers[event] || []).push(cb)
  }

  off <K extends keyof BrainEvents>(event: K, cb: (payload: BrainEvents[K]) => void): void {
    this.handlers[event] = (this.handlers[event] || []).filter(h => h !== cb)
  }

  private emit(event: string, ...args: any[]): void {
    for (const h of this.handlers[event] || []) {
      try { h(...args) } catch {}
    }
  }

  // ==================== внутреннее ====================

  private wire(): void {
    const bot = this.bot

    bot.on?.('health', () => {
      const prev = { hp: this.lastHp, food: this.lastFood }
      const hp = bot.health ?? prev.hp
      const food = bot.food ?? prev.food
      this.lastHp = hp
      this.lastFood = food
      this.emit('health', { hp, food, prev })
      if (hp <= 6 && prev.hp > 6) this.emit('danger_hp', hp)
      if (food <= 6 && prev.food > 6) this.emit('hungry', food)
    })

    bot.on?.('entitySpawn', (entity: any) => {
      const info = this.describeEntity(entity)
      if (!info) return
      this.emit('entity', info)
      if (info.isHostile && info.distance <= this.threatRadius) this.emit('threat', info)
    })

    bot.on?.('playerJoined', (player: any) => {
      this.emit('playerJoined', player?.username ?? 'unknown')
    })

    bot.on?.('playerLeft', (player: any) => {
      this.emit('playerLeft', player?.username ?? 'unknown')
    })

    bot.on?.('death', () => {
      this.emit('death')
    })
  }

  private describeEntity(entity: any): EntityInfo | null {
    const bot = this.bot
    if (!entity || !entity.position || !bot.entity?.position) return null
    const kind = entity.type === 'player' ? 'player' : entity.type === 'mob' ? 'mob' : 'other'
    const name = entity.username || entity.name || entity.displayName?.toString?.() || `#${entity.id}`
    const hostile = kind === 'mob' && (
      HOSTILE_MOBS.has(entity.name) || entity.kind === 'Hostile mobs'
    )
    return {
      id: entity.id,
      kind,
      name,
      position: entity.position,
      distance: bot.entity.position.distanceTo(entity.position),
      isHostile: hostile
    }
  }
}
