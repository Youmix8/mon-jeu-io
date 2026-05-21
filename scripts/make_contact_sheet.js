const sharp = require('../node_modules/sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '../public/assets');
const OUT = path.join(process.env.HOME, 'Desktop/recap_nouveaux_assets.png');

const NEW_FILES = [
  'crossbowman','heavy_knight','catapult','cannon','general','elite_guard',
  'boat','port','tower_archer','bombard_tower','citadel',
  'mage','necromancer','skeleton','lich','fire_elemental','arcane_dragon',
  'tower_mage','sanctum','spell_portal',
  'pilgrim','inquisitor','paladin','angel','god_avatar',
  'altar','temple','cathedral',
  'spell_blessing','spell_holy_light','icon_favor','axis_science','axis_magic','axis_religion',
  'proj_arrow','proj_crossbow_bolt','proj_catapult_rock','proj_cannonball','proj_throwing_spear',
  'proj_magic_bolt','proj_fireball_small','proj_lightning','proj_ice_shard','proj_dark_orb','proj_dragon_breath',
  'proj_holy_bolt','proj_inquisitor_hammer','proj_divine_beam',
  'icon_research','icon_mana','icon_faith',
].map(n => `${n}.png`).filter(n => fs.existsSync(path.join(ASSETS_DIR, n)));

const THUMB = 128;
const COLS = 10;
const ROWS = Math.ceil(NEW_FILES.length / COLS);
const PAD = 4;
const CELL = THUMB + PAD * 2;
const W = COLS * CELL;
const H = ROWS * CELL;

async function main() {
  console.log(`Génération planche-contact : ${NEW_FILES.length} assets, ${COLS}×${ROWS} grille, ${W}×${H}px`);

  const thumbs = await Promise.all(NEW_FILES.map(async (name, i) => {
    const buf = await sharp(path.join(ASSETS_DIR, name))
      .resize(THUMB, THUMB, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return { input: buf, left: col * CELL + PAD, top: row * CELL + PAD };
  }));

  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 255 } }
  })
    .composite(thumbs)
    .png()
    .toFile(OUT);

  console.log(`✅ Planche sauvée : ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
