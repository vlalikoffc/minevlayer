import { Vec3 } from 'vec3';
import type { Block } from 'prismarine-block';
/**
 * Получить ID блока по имени. Учитывает версию.
 */
export declare function getBlockId(bot: any, name: string): number | null;
export declare function getItemId(bot: any, name: string): number | null;
/**
 * Найти лучший инструмент в инвентаре для данного блока
 */
export declare function findBestTool(bot: any, block: Block): number | null;
export declare function toVec3(v: any): Vec3;
export declare function isEntity(obj: any): boolean;
/**
 * Умный поиск блока: по имени или предикату
 */
export declare function findBlocksForName(bot: any, blockName: string, maxDistance?: number, count?: number): Vec3[];
export declare function sleepMs(ms: number): Promise<void>;
//# sourceMappingURL=helpers.d.ts.map