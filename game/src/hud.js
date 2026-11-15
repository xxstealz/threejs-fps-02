// The HUD: every number and banner on screen, updated from the game state. The DOM
// is only ever written here, so a wrong number has exactly one place to hide.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    health: $('health'), healthFill: $('health-fill'), armorFill: $('armor-fill'),
    money: $('money'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'), grenades: $('grenades'),
    timer: $('timer'), scoreAtk: $('score-atk'), scoreDef: $('score-def'),
    bombStatus: $('bomb-status'), killfeed: $('killfeed'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    usebar: $('usebar'), useLabel: $('use-label'), useFill: $('use-fill'),
    damage: $('damage'), flash: $('flash'), hitmarker: $('hitmarker'),
    crosshair: $('crosshair'), buy: $('buy'), buyTable: $('buy-table'),
    buyMoney: $('buy-money'), buyRound: $('buy-round'),
  };
  let hitTimeout = 0;
  let bannerTimeout = 0;

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(health) {
      els.health.textContent = String(Math.round(health));
      els.health.classList.toggle('low', health <= 30);
      els.healthFill.style.width = `${Math.max(0, health)}%`;
    },
    setArmor(armor) {
      els.armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
    },
    setMoney(money) {
      els.money.textContent = `$${money}`;
    },
    setAmmo(mag, reserve, empty) {
      els.ammoMag.textContent = String(mag);
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.ammoMag.parentElement.classList.toggle('empty', empty);
    },
    setWeapon(name, grenadeCounts) {
      els.weaponName.textContent = name;
      const parts = [];
      if (grenadeCounts.frag) parts.push(`Frag ×${grenadeCounts.frag}`);
      if (grenadeCounts.smoke) parts.push(`Smoke ×${grenadeCounts.smoke}`);
      if (grenadeCounts.flash) parts.push(`Flash ×${grenadeCounts.flash}`);
      els.grenades.textContent = parts.join(' · ');
    },
    setTimer(seconds, low) {
      els.timer.textContent = formatTime(seconds);
      els.timer.classList.toggle('low', low);
    },
    setScore(atk, def) {
      els.scoreAtk.textContent = String(atk);
      els.scoreDef.textContent = String(def);
    },
    setBombStatus(text) {
      els.bombStatus.textContent = text;
    },
    killfeed(killer, victim, weaponName, headshot, killerIsPlayer, victimIsPlayer) {
      const row = document.createElement('div');
      const k = document.createElement('b');
      k.textContent = killer;
      const v = document.createElement('b');
      v.textContent = victim;
      const w = document.createElement('span');
      w.textContent = ` ${weaponName} `;
      row.append(k, document.createTextNode(' ▸ '), v, w);
      if (headshot) {
        const h = document.createElement('span');
        h.className = 'headshot';
        h.textContent = '◎';
        row.append(h);
      }
      if (killerIsPlayer) k.style.color = '#e8a33d';
      if (victimIsPlayer) v.style.color = '#d9573b';
      els.killfeed.prepend(row);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 9000);
    },
    banner(title, sub, kind) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.className = kind ? `on ${kind}` : 'on';
      clearTimeout(bannerTimeout);
      // In a screenshot replay the banner must stay for the capture.
      if (window.__shotMode) return;
      bannerTimeout = setTimeout(() => {
        els.banner.className = '';
      }, 3800);
    },
    hideBanner() {
      clearTimeout(bannerTimeout);
      els.banner.className = '';
    },
    useBar(show, label, progress) {
      els.usebar.classList.toggle('on', show);
      if (show) {
        els.useLabel.textContent = label;
        els.useFill.style.width = `${Math.round(progress * 100)}%`;
      }
    },
    damageFlash() {
      els.damage.style.opacity = '1';
      setTimeout(() => { els.damage.style.opacity = '0'; }, 140);
    },
    flashWhite(strength) {
      els.flash.style.opacity = String(Math.min(1, strength));
      setTimeout(() => { els.flash.style.opacity = '0'; }, 90);
    },
    hitmarker(killed) {
      els.hitmarker.classList.add('on');
      clearTimeout(hitTimeout);
      hitTimeout = setTimeout(() => els.hitmarker.classList.remove('on'), killed ? 260 : 120);
    },
    setCrosshairGap(px) {
      const gap = Math.max(2, Math.round(px));
      els.crosshair.style.transform = `translate(-50%, -50%) scale(${1 + gap / 30})`;
    },
    showBuy(show, economy, round) {
      els.buy.classList.toggle('on', show);
      if (!show) return;
      els.buyRound.textContent = String(round);
      els.buyMoney.textContent = `$${economy.money}`;
      const rows = [];
      for (const def of Object.values(WEAPONS)) {
        const owned = economy.weapons.includes(def.id);
        rows.push(`<tr><td class="key">${{ pistol: '–', smg: '2', rifle: '1', shotgun: '3', sniper: '4' }[def.id] ?? ''}</td><td>${def.name}</td><td class="${owned ? 'owned' : ''}">${owned ? 'OWNED' : ''}</td><td class="price">${def.price === 0 ? 'free' : `$${def.price}`}</td></tr>`);
      }
      rows.push(`<tr><td class="key">5</td><td>Body Armour</td><td class="${economy.armor > 0 ? 'owned' : ''}">${economy.armor > 0 ? 'OWNED' : ''}</td><td class="price">$${ARMOR_PRICE}</td></tr>`);
      for (const def of Object.values(GRENADES)) {
        const count = economy.grenades[def.id];
        rows.push(`<tr><td class="key">${{ frag: '6', smoke: '7', flash: '8' }[def.id]}</td><td>${def.name}</td><td class="${count ? 'owned' : ''}">${count ? `×${count}` : ''}</td><td class="price">$${def.price}</td></tr>`);
      }
      els.buyTable.innerHTML = rows.join('');
    },
  };
}
