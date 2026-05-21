/**
 * Découpe batch_25_38.png — détection des vrais bords via scan pixel par pixel.
 * Fond TRANSPARENT (A=0). Row bands déterminés empiriquement.
 * Cas spécial : angel+god_avatar n'ont pas de gap transparent → split au minimum local.
 */
const sharp = require('../node_modules/sharp');
const path  = require('path');
const fs    = require('fs');

const SRC  = path.join(process.env.HOME, 'Desktop/assets-bruts/batch_25_38.png');
const DEST = path.join(__dirname, '../public/assets');
const PAD  = 14;

// Bandes de lignes (y start inclus, y end exclus) — déterminées par scan alpha
const ROW_BANDS = [
  { y1: 65,  y2: 290 },  // Rangée 1 : personnages
  { y1: 395, y2: 592 },  // Rangée 2 : bâtiments
  { y1: 650, y2: 878 },  // Rangée 3 : icônes/sorts
];

// Noms par rangée
const NAMES = [
  ['pilgrim.png', 'inquisitor.png', 'paladin.png', 'angel.png', 'god_avatar.png'],
  ['altar.png', 'temple.png', 'cathedral.png'],
  ['spell_blessing.png', 'spell_holy_light.png', 'icon_favor.png', 'axis_science.png', 'axis_magic.png', 'axis_religion.png'],
];

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/** Trouve les segments de colonnes entièrement transparentes (A<30 sur toute la bande). */
function findColSegments(data, width, y1, y2, minGapPx = 10) {
  const bandH = y2 - y1;
  // colonne gap = 100% transparent sur la bande
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

/** Affine les bords verticaux d'un segment dans la bande. */
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

/** Trouve la colonne avec le minimum d'opacité dans [xMin, xMax] pour la bande [y1,y2]. */
function findSplitX(data, width, xMin, xMax, y1, y2) {
  let minCnt = Infinity, minX = Math.floor((xMin + xMax) / 2);
  for (let x = xMin; x <= xMax; x++) {
    let cnt = 0;
    for (let y = y1; y < y2; y++) if (data[(y * width + x) * 4 + 3] >= 30) cnt++;
    if (cnt < minCnt) { minCnt = cnt; minX = x; }
  }
  return minX;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const meta = await sharp(SRC).metadata();
  console.log(`Source : ${meta.width}×${meta.height}, alpha:${meta.hasAlpha}`);

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let created = 0, errors = 0;

  for (let bi = 0; bi < ROW_BANDS.length; bi++) {
    const { y1, y2 } = ROW_BANDS[bi];
    const names = NAMES[bi];

    let segs = findColSegments(data, width, y1, y2, 10);
    console.log(`\nBande ${bi} (y=${y1}-${y2}) : ${segs.length} segment(s) détecté(s) → ${names.length} attendu(s)`);

    // ── Cas spécial rangée 0 : angel+god_avatar fusionnés ──
    if (bi === 0 && segs.length === 4 && names.length === 5) {
      const merged = segs[3]; // le grand segment fusionné
      const splitX = findSplitX(data, width, merged.start + 100, merged.end - 100, y1, y2);
      console.log(`  → Split angel/god_avatar au minimum x=${splitX}`);
      segs = [
        segs[0], segs[1], segs[2],
        { start: merged.start, end: splitX },
        { start: splitX + 1,  end: merged.end },
      ];
    }

    // ── Cas spécial rangée 1 : débordement de god_avatar dans la bande ──
    if (bi === 1 && segs.length > names.length) {
      console.log(`  → Troncature à ${names.length} segments (les autres sont des débordements)`);
      segs = segs.slice(0, names.length);
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
      console.log(`  ✅ ${name.padEnd(26)} (${w}×${h}px, ${sz}KB)  x=${left}-${right}  y=${top2}-${bottom2}`);
      created++;
    }
  }

  console.log(`\n✅ Terminé : ${created} sprites extraits, ${errors} erreur(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
