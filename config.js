// ============================================================
// AGE OF PIXELS — game configuration & balance data
// All gameplay-facing text is in English.
// ============================================================

const CFG = {
  TILE_W: 64,          // on-screen tile width (px)
  TILE_H: 32,          // on-screen tile height (px)
  MAP_SIZE: 48,        // map is MAP_SIZE x MAP_SIZE tiles
  POP_CAP: 60,
  START_RES: { food: 250, wood: 250, gold: 100 },
  START_VILLAGERS: 3,
  FOG_REFRESH: 0.25,   // seconds between fog recomputes
  AGGRO_SCAN: 0.35,    // seconds between idle-unit target scans
  CARRY_CAP: 15,       // resources a villager carries
  MAX_BUILDERS: 3,     // construction speed caps at 3 villagers
};

const TEAM_COLORS = [
  { main: '#3a6fd8', dark: '#24468c', name: 'Blue' },
  { main: '#d8483a', dark: '#8c2a24', name: 'Red' },
];

// ---------------- Units ----------------
// speed: tiles/sec, range in tiles, rate: seconds between attacks
const UNITS = {
  villager: {
    name: 'Villager', cost: { food: 50 }, hp: 30, atk: 2, range: 0.9,
    rate: 1.2, speed: 2.3, sight: 5, pop: 1, trainTime: 5,
    radius: 0.28, isVillager: true, gatherRate: 1.8,
  },
  infantry: {
    name: 'Man-at-Arms', cost: { food: 60, gold: 20 }, hp: 95, atk: 9, range: 0.9,
    rate: 1.3, speed: 2.2, sight: 6, pop: 1, trainTime: 8, radius: 0.3,
  },
  archer: {
    name: 'Archer', cost: { food: 40, wood: 40 }, hp: 45, atk: 7, range: 5,
    rate: 1.5, speed: 2.3, sight: 7, pop: 1, trainTime: 8,
    radius: 0.28, projectile: 'arrow',
  },
  knight: {
    name: 'Knight', cost: { food: 90, gold: 70 }, hp: 150, atk: 13, range: 1.0,
    rate: 1.4, speed: 3.4, sight: 6, pop: 2, trainTime: 11, radius: 0.36,
  },
  ram: {
    name: 'Battering Ram', cost: { wood: 120, gold: 30 }, hp: 220, atk: 45, range: 1.0,
    rate: 2.5, speed: 1.3, sight: 4, pop: 2, trainTime: 13, radius: 0.42,
    buildingsOnly: true, pierceResist: 0.85, // takes only 15% damage from arrows
  },
  catapult: {
    name: 'Catapult', cost: { wood: 120, gold: 120 }, hp: 70, atk: 22, range: 7,
    rate: 4.0, speed: 1.15, sight: 8, pop: 3, trainTime: 16, radius: 0.4,
    projectile: 'stone', aoe: 1.1,
  },
};

// Damage multipliers: BONUS[attackerKey][targetKey]
const BONUS = {
  infantry: { knight: 1.7 },
  archer:   { infantry: 1.6, villager: 1.3 },
  knight:   { archer: 1.6, catapult: 2.2, ram: 1.5 },
};

// Multiplier applied when a unit type hits a building
const VS_BUILDING = {
  villager: 0.5, infantry: 0.6, archer: 0.25, knight: 0.6,
  ram: 1.0, catapult: 2.0,
};

// ---------------- Buildings ----------------
// size: footprint in tiles (size x size)
const BUILDINGS = {
  towncenter: {
    name: 'Town Hall', size: 2, hp: 1800, cost: {}, buildTime: 0,
    trains: ['villager'], dropoff: true, sight: 8,
    attack: { dmg: 6, range: 7, rate: 1.6 },
  },
  barracks: {
    name: 'Barracks', size: 2, hp: 800, cost: { wood: 150 }, buildTime: 18,
    trains: ['infantry', 'archer'], sight: 5,
  },
  stable: {
    name: 'Stable', size: 2, hp: 800, cost: { wood: 175 }, buildTime: 20,
    trains: ['knight'], sight: 5,
  },
  workshop: {
    name: 'Siege Workshop', size: 2, hp: 900, cost: { wood: 200, gold: 50 }, buildTime: 22,
    trains: ['ram', 'catapult'], sight: 5,
  },
  farm: {
    name: 'Farm', size: 2, hp: 150, cost: { wood: 60 }, buildTime: 6,
    farmRate: 1.3, sight: 3, // food/sec while a villager works it
  },
  tower: {
    name: 'Defense Tower', size: 1, hp: 550, cost: { wood: 100, gold: 25 }, buildTime: 15,
    attack: { dmg: 9, range: 7.5, rate: 1.4 }, sight: 9,
  },
  market: {
    name: 'Market', size: 2, hp: 600, cost: { wood: 125 }, buildTime: 16,
    market: true, sight: 5,
  },
};

// Buildings a villager can place (Town Hall excluded — one per player)
const BUILD_MENU = ['farm', 'barracks', 'stable', 'workshop', 'tower', 'market'];

// ---------------- Market ----------------
// Trade 100 of a resource against gold, both ways.
const MARKET = { sellGets: 70, buyCosts: 110, lot: 100 };

// ---------------- Civilizations ----------------
const CIVS = {
  english: {
    name: 'English', icon: 'archer',
    desc: 'Archers shoot farther and hit harder. Farms are cheaper.',
    perks: ['Archers: +1 range, +25% damage', 'Farms cost -25%'],
  },
  french: {
    name: 'French', icon: 'knight',
    desc: 'Heavy cavalry and shrewd merchants.',
    perks: ['Knights: +20% HP and damage', 'Market trades 20% better'],
  },
  mongols: {
    name: 'Mongols', icon: 'catapult',
    desc: 'Fast armies and cheap siege engines.',
    perks: ['Siege units cost -25%', 'Military moves +10% faster'],
  },
};

// Returns the unit stats for a civ, with civ bonuses applied.
const _statCache = {};
function unitStat(civKey, unitKey) {
  const ck = civKey + '_' + unitKey;
  if (_statCache[ck]) return _statCache[ck];
  const s = Object.assign({}, UNITS[unitKey]);
  s.cost = Object.assign({}, s.cost);
  if (civKey === 'english' && unitKey === 'archer') {
    s.range += 1; s.atk = Math.round(s.atk * 1.25 * 10) / 10;
  }
  if (civKey === 'french' && unitKey === 'knight') {
    s.hp = Math.round(s.hp * 1.2); s.atk = Math.round(s.atk * 1.2 * 10) / 10;
  }
  if (civKey === 'mongols') {
    if (unitKey === 'ram' || unitKey === 'catapult') {
      for (const r in s.cost) s.cost[r] = Math.round(s.cost[r] * 0.75);
    }
    if (unitKey !== 'villager') s.speed = Math.round(s.speed * 1.1 * 100) / 100;
  }
  _statCache[ck] = s;
  return s;
}

function buildingCost(civKey, bKey) {
  const cost = Object.assign({}, BUILDINGS[bKey].cost);
  if (civKey === 'english' && bKey === 'farm') {
    for (const r in cost) cost[r] = Math.round(cost[r] * 0.75);
  }
  return cost;
}

function marketRates(civKey) {
  if (civKey === 'french') return { sellGets: 84, buyCosts: 100, lot: MARKET.lot };
  return MARKET;
}

function costText(cost) {
  const parts = [];
  for (const r in cost) parts.push(cost[r] + ' ' + r);
  return parts.join(', ');
}

// ---------------- Bot difficulties ----------------
const DIFFICULTIES = {
  easy:   { name: 'Easy',   gatherMult: 0.6, villagerTarget: 12, waveSize: 9, bonusRes: 0 },
  normal: { name: 'Normal', gatherMult: 1.0, villagerTarget: 16, waveSize: 6, bonusRes: 0 },
  hard:   { name: 'Hard',   gatherMult: 1.4, villagerTarget: 18, waveSize: 7, bonusRes: 200 },
};
