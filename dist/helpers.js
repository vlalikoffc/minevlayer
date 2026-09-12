"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockId = getBlockId;
exports.getItemId = getItemId;
exports.findBestTool = findBestTool;
exports.toVec3 = toVec3;
exports.isEntity = isEntity;
exports.findBlocksForName = findBlocksForName;
exports.sleepMs = sleepMs;
const vec3_1 = require("vec3");
/**
 * Получить ID блока по имени. Учитывает версию.
 */
function getBlockId(bot, name) {
    const normalized = name.toLowerCase();
    // пробуем через registry
    try {
        const block = bot.registry.blocksByName[normalized];
        if (block)
            return block.id;
    }
    catch { }
    // fallback через minecraft-data
    try {
        const mcData = require('minecraft-data')(bot.version);
        const block = mcData.blocksByName[normalized];
        if (block)
            return block.id;
    }
    catch { }
    return null;
}
function getItemId(bot, name) {
    const normalized = name.toLowerCase();
    try {
        const item = bot.registry.itemsByName[normalized];
        if (item)
            return item.id;
    }
    catch { }
    try {
        const mcData = require('minecraft-data')(bot.version);
        const item = mcData.itemsByName[normalized];
        if (item)
            return item.id;
    }
    catch { }
    // также пробуем как блок
    return getBlockId(bot, name);
}
/**
 * Найти лучший инструмент в инвентаре для данного блока
 */
function findBestTool(bot, block) {
    // используем встроенный bot.inventory + сравнение скорости
    // Упрощённо: ищем предмет с максимальной скоростью копания
    let bestSlot = null;
    let bestSpeed = -1;
    for (let i = 0; i < bot.inventory.slots.length; i++) {
        const item = bot.inventory.slots[i];
        if (!item)
            continue;
        // получаем digTime для этого инструмента — чем меньше, тем лучше
        const speed = 1 / (block.digTime(item.type, false, false, false, item.enchants || [], []) || 9999);
        if (speed > bestSpeed) {
            bestSpeed = speed;
            bestSlot = i;
        }
    }
    return bestSlot;
}
function toVec3(v) {
    if (v instanceof vec3_1.Vec3)
        return v;
    if (Array.isArray(v))
        return new vec3_1.Vec3(v[0], v[1], v[2]);
    if (v && typeof v.x === 'number')
        return new vec3_1.Vec3(v.x, v.y, v.z);
    throw new Error(`Cannot convert to Vec3: ${JSON.stringify(v)}`);
}
function isEntity(obj) {
    return obj && typeof obj === 'object' && 'position' in obj && 'type' in obj && 'id' in obj;
}
/**
 * Умный поиск блока: по имени или предикату
 */
function findBlocksForName(bot, blockName, maxDistance = 64, count = 1) {
    const id = getBlockId(bot, blockName);
    const matcher = id !== null
        ? (b) => b.type === id
        : (b) => b.name === blockName.toLowerCase() || b.displayName.toLowerCase().includes(blockName.toLowerCase());
    try {
        return bot.findBlocks({ matching: matcher, maxDistance, count });
    }
    catch (e) {
        // fallback: ручной поиск
        return [];
    }
}
function sleepMs(ms) {
    return new Promise(res => setTimeout(res, ms));
}
//# sourceMappingURL=helpers.js.map