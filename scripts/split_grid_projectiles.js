/**
 * Découpe projectiles_sheet.png — détection des vrais bords via scan pixel.
 * Fond TRANSPARENT (A=0). Row bands déterminés empiriquement.
 * Cas spécial : dark_orb+dragon_breath fusionnés → split à x=1280 (frontière col4/col5).
 * Cas spécial : proj row4 contient 5 icônes (au lieu de 3 prévus) → nommées icon_extra_*.
 */
const sharp = require('../node_modules/sharp');
const path  = require('path');
const fs    = require('fs');

const SRC  = path.join(process.env.HOME, 'Desktop/assets-bruts/projectiles_sheet.png');
const DEST = path.join(__dirname, '../public/assets');
const PAD  = 14;

const ROW_BANDS = [
  { y1: 155, y2: 258 },  // Rangée 1 : flèches / projectiles physiques
  { y1: 320, y2: 438 },  // Rangée 2 : projectiles magiques
  { y1: 495, y2: 598 },  // Rangée 3 : projectiles divins
  { y1: 660, y2: 778 },  // Rangée 4 : icônes ressources
];

// null = détection auto du nombre de sprites (row4 a 5 icônes, pas 3)
const NAMES = [
  ['proj_arrow.png', 'proj_crossbow_bolt.png', 'proj_catapult_rock.png', 'proj_cannonball.png', 'proj_throwing_spear.png'],
  ['proj_magic_bolt.png', 'proj_fireball_small.png', 'proj_lightning.png', 'proj_ice_shard.png', 'proj_dark_orb.png', 'proj_dragon_breath.png'],
  ['proj_holy_bolt.png', 'proj_inquisitor_hammer.png', 'proj_divine_beam.png'],
  ['icon_research.png', 'icon_mana.png', 'icon_faith.png', 'icon_extra_4.png', 'icon_extra_5.png'],
];

// ─── Utilitaires (identiques à split_grid_25_38.js) ──────────────────────────

function findColSegments(data, width, y1, y2, minGapPx = 10) {
  const isGap = new Array(width);
  for (let x = 0; x < width; x++) {
    let allTr = true;
    for (let y = y1; y < y2; y++) {
      if (data[(y * width + x) * 4 + 3] >= 30) { allTr = false; break; }
    }
    isGap[x] = allTr;
  }
  const segs = [];
  let i = 0;
  while (i < width) {
    while (i < width && isGap[i]) i++;
    if (i >= width) break;
    const start = i;
    let end = i;
    while (i < width) {
      if (!isGap[i]) { end = i; i++; }
      else {
        const g0 = i;
        while (i < width && isGap[i]) i++;
        if (i - g0 >= minGapPx) break;
      }
    }
    segs.push({ start, end });
  }
  return segs;
}

function vertBounds(data, width, x1, x2, y1, y2) {
  let top = y2, bottom = y1;
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y < y2; y++) {
      if (data[(y * width + x) * 4 + 3] >= 30) {
        if (y < top)    top    = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { top, bottom };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const meta = await sharp(SRC).metadata();
  console.log(`Source : ${meta.width}×${meta.height}, alpha:${meta.hasAlpha}`);

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let created = 0, errors = 0;
  const extras = [];

  for (let bi = 0; bi < ROW_BANDS.length; bi++) {
    const { y1, y2 } = ROW_BANDS[bi];
    const names = NAMES[bi];

    let segs = findColSegments(data, width, y1, y2, 10);
    console.log(`\nBande ${bi} (y=${y1}-${y2}) : ${segs.length} segment(s) détecté(s) → ${names.length} attendu(s)`);

    // ── Cas spécial rangée 1 : dark_orb+dragon_breath fusionnés ──
    // Pas de gap transparent entre eux → split fixe à x=1280 (frontière 6 colonnes × 256px)
    if (bi === 1 && segs.length === 5 && names.length === 6) {
      const merged = segs[4];
      const SPLIT_X = 1280;
      console.log(`  → Split dark_orb/dragon_breath à x=${SPLIT_X} (frontière col4/col5 en grille 6×256)`);
      segs = [
        segs[0], segs[1], segs[2], segs[3],
        { start: merged.start, end: SPLIT_X - 1 },
        { start: SPLIT_X,      end: merged.end  },
      ];
    }

    for (let si = 0; si < names.length; si++) {
      const name = names[si];
      const seg  = segs[si];
      if (!seg) { console.warn(`❌ Pas de segment pour ${name}`); errors++; continue; }

      const { top, bottom } = vertBounds(data, width, seg.start, seg.end, y1, y2);
      const left   = Math.max(0, seg.start - PAD);
      const right  = Math.min(width  - 1, seg.end   + PAD);
      const top2   = Math.max(0, top    - PAD);
      const bottom2= Math.min(height - 1, bottom  + PAD);
      const w = right  - left   + 1;
      const h = bottom2 - top2 + 1;

      const destPath = path.join(DEST, name);
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

      await sharp(SRC)
        .extract({ left, top: top2, width: w, height: h })
        .png()
        .toFile(destPath);

      const sz = Math.round(fs.statSync(destPath).size / 1024);
      const note = name.startsWith('icon_extra') ? ' ⚠️  icône extra non prévue' : '';
      console.log(`  ✅ ${name.padEnd(30)} (${w}×${h}px, ${sz}KB)  x=${left}-${right}${note}`);
      if (name.startsWith('icon_extra')) extras.push(name);
      created++;
    }
  }

  if (extras.length > 0) {
    console.log(`\n⚠️  ${extras.length} icône(s) supplémentaire(s) détectée(s) dans la rangée 4 :`);
    extras.forEach(e => console.log(`   → ${e} (dans public/assets/ — à renommer si besoin)`));
  }

  console.log(`\n✅ Terminé : ${created} sprites extraits, ${errors} erreur(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
