// The money. Start at $800, earn for kills, plants and round wins, lose with a
// streak bonus so a team that keeps losing can still buy. One object owns the
// player's wallet; the buy menu reads it and nothing else spends it.
import { WEAPONS, GRENADES, ARMOR_PRICE, ARMOR_POINTS } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const MAX_LOSS_REWARD = 2900;

export function createEconomy() {
  const state = {
    money: START_MONEY,
    weapons: ['pistol'],
    current: 'pistol',
    armor: 0,
    grenades: { frag: 0, smoke: 0, flash: 0 },
    lossStreak: 0,
  };

  function buy(itemId) {
    if (WEAPONS[itemId]) {
      const def = WEAPONS[itemId];
      if (state.weapons.includes(itemId)) return { ok: false, reason: 'Already owned' };
      if (state.money < def.price) return { ok: false, reason: 'Not enough money' };
      state.money -= def.price;
      state.weapons.push(itemId);
      state.current = itemId;
      return { ok: true, kind: 'weapon', id: itemId };
    }
    if (GRENADES[itemId]) {
      const def = GRENADES[itemId];
      if (state.money < def.price) return { ok: false, reason: 'Not enough money' };
      state.money -= def.price;
      state.grenades[itemId] += 1;
      return { ok: true, kind: 'grenade', id: itemId };
    }
    if (itemId === 'armor') {
      if (state.armor >= ARMOR_POINTS) return { ok: false, reason: 'Armour already full' };
      if (state.money < ARMOR_PRICE) return { ok: false, reason: 'Not enough money' };
      state.money -= ARMOR_PRICE;
      state.armor = ARMOR_POINTS;
      return { ok: true, kind: 'armor', id: 'armor' };
    }
    return { ok: false, reason: 'Unknown item' };
  }

  return {
    state,
    buy,
    add(amount) {
      state.money += amount;
    },
    awardRound(won) {
      if (won) {
        state.money += WIN_REWARD;
        state.lossStreak = 0;
      } else {
        state.lossStreak += 1;
        state.money += Math.min(MAX_LOSS_REWARD, LOSS_REWARD + (state.lossStreak - 1) * LOSS_STREAK_BONUS);
      }
    },
    resetMatch() {
      state.money = START_MONEY;
      state.weapons = ['pistol'];
      state.current = 'pistol';
      state.armor = 0;
      state.grenades = { frag: 0, smoke: 0, flash: 0 };
      state.lossStreak = 0;
    },
    // A player who died loses the rifle they were holding; the pistol stays.
    onDeath() {
      if (state.current !== 'pistol') {
        state.weapons = state.weapons.filter((w) => w !== state.current);
      }
      state.current = 'pistol';
      state.armor = 0;
      state.grenades = { frag: 0, smoke: 0, flash: 0 };
    },
  };
}
