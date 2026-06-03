// ════════════════════════════════════════════════════════════════════
// Animations — helpers tweens Phaser centralisés (utilisé par MainScene).
//
// Toutes les animations sont 100% en code, pas de spritesheet.
// Convention : chaque fonction prend `scene` (Phaser.Scene) et `sprite`
// (Phaser.GameObjects.*) et retourne le tween principal (ou null).
// ════════════════════════════════════════════════════════════════════

const Animations = (() => {

  // ── Idle ambient : bobbing vertical doux pendant le déplacement ──
  function animateUnitMove(scene, sprite) {
    if (!sprite || sprite._moveTween) return sprite._moveTween;
    const baseY = sprite._baseScaleY || sprite.scaleY;
    sprite._moveTween = scene.tweens.add({
      targets: sprite,
      scaleY: { from: baseY, to: baseY * 1.05 },
      duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    return sprite._moveTween;
  }
  function stopUnitMove(sprite) {
    if (sprite && sprite._moveTween) {
      sprite._moveTween.stop();
      sprite.scaleY = sprite._baseScaleY || sprite.scaleY;
      sprite._moveTween = null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // RIG DE COMBAT — animations de coups par catégorie d'unité.
  //
  // Convention critique (cf. piège _baseScaleX/Y) :
  //   - Le squash&stretch passe par sprite._atkScaleX/_atkScaleY (lus par
  //     MainScene._updateUnitBarPositions) et JAMAIS par setScale direct, car
  //     le wobble idle écrase le scale chaque frame.
  //   - La position (lunge) tween sprite.x/y ; on stoppe le tween de sync
  //     serveur le temps de l'anim puis on restaure la position autoritative
  //     (scene.unitServerPos) au onComplete.
  //   - Le facing passe par setFlipX (pas un scaleX négatif → casserait _baseScaleX).
  // ════════════════════════════════════════════════════════════════

  function _unitVec(sprite, tx, ty) {
    const dx = tx - sprite.x, dy = ty - sprite.y;
    const d = Math.hypot(dx, dy) || 1;
    return { ux: dx / d, uy: dy / d };
  }

  function _restoreAttack(scene, sprite, sx, sy) {
    sprite._attacking = false;
    sprite._atkScaleX = 1;
    sprite._atkScaleY = 1;
    if (sprite._attackSafety) { sprite._attackSafety.remove(false); sprite._attackSafety = null; }
    const sp = scene.unitServerPos && sprite._unitId && scene.unitServerPos[sprite._unitId];
    sprite.x = sp ? sp.x : sx;
    sprite.y = sp ? sp.y : sy;
  }

  // Filet de sécurité : si la chaîne de tweens est interrompue sans onComplete
  // (sprite détruit, tween remplacé, perte de focus prolongée…), force la
  // restauration après la durée attendue → l'unité ne reste jamais coincée
  // en "attacking" (sinon _syncUnits ne resynchronise plus sa position).
  function _armSafety(scene, sprite, sx, sy, totalMs) {
    if (sprite._attackSafety) sprite._attackSafety.remove(false);
    sprite._attackSafety = scene.time.delayedCall(totalMs + 200, () => {
      if (sprite._attacking) _restoreAttack(scene, sprite, sx, sy);
    });
  }

  function _faceTarget(sprite, tx, ty) {
    const dx = tx - sprite.x;
    if (Math.abs(dx) > sprite.displayWidth * 0.15) sprite.setFlipX(dx < 0);
  }

  // ── Mêlée : anticipation (recul + squash) → lunge (avant + stretch) → recoil ──
  function animateMelee(scene, sprite, tx, ty, onStrike) {
    if (!sprite) { if (onStrike) onStrike(); return; }
    if (sprite._attacking) { if (onStrike) onStrike(); return; }
    sprite._attacking = true;
    const sx = sprite.x, sy = sprite.y;
    const { ux, uy } = _unitVec(sprite, tx, ty);
    _faceTarget(sprite, tx, ty);
    if (sprite._unitId && scene.unitTweens && scene.unitTweens[sprite._unitId]) {
      scene.unitTweens[sprite._unitId].stop();
      delete scene.unitTweens[sprite._unitId];
    }
    const BACK = 7, LUNGE = 16;
    _armSafety(scene, sprite, sx, sy, 295);
    scene.tweens.chain({
      targets: sprite,
      onComplete: () => _restoreAttack(scene, sprite, sx, sy),
      tweens: [
        { x: sx - ux * BACK, y: sy - uy * BACK, _atkScaleX: 1.12, _atkScaleY: 0.90,
          duration: 95, ease: 'Sine.easeOut' },
        { x: sx + ux * LUNGE, y: sy + uy * LUNGE, _atkScaleX: 0.88, _atkScaleY: 1.16,
          duration: 80, ease: 'Quad.easeIn', onComplete: () => { if (onStrike) onStrike(); } },
        { x: sx, y: sy, _atkScaleX: 1, _atkScaleY: 1, duration: 120, ease: 'Sine.easeOut' },
      ],
    });
  }

  // ── Distance (science) : draw (penche en arrière + compresse) → fire (snap) ──
  function animateDraw(scene, sprite, tx, ty, onRelease) {
    if (!sprite) { if (onRelease) onRelease(); return; }
    if (sprite._attacking) { if (onRelease) onRelease(); return; }
    sprite._attacking = true;
    const sx = sprite.x, sy = sprite.y;
    const { ux, uy } = _unitVec(sprite, tx, ty);
    _faceTarget(sprite, tx, ty);
    if (sprite._unitId && scene.unitTweens && scene.unitTweens[sprite._unitId]) {
      scene.unitTweens[sprite._unitId].stop();
      delete scene.unitTweens[sprite._unitId];
    }
    _armSafety(scene, sprite, sx, sy, 290);
    scene.tweens.chain({
      targets: sprite,
      onComplete: () => _restoreAttack(scene, sprite, sx, sy),
      tweens: [
        { x: sx - ux * 5, y: sy - uy * 5, _atkScaleX: 1.08, _atkScaleY: 0.95,
          duration: 130, ease: 'Sine.easeOut' },
        { x: sx + ux * 3, y: sy + uy * 3, _atkScaleX: 0.96, _atkScaleY: 1.05,
          duration: 70, ease: 'Quad.easeIn', onComplete: () => { if (onRelease) onRelease(); } },
        { x: sx, y: sy, _atkScaleX: 1, _atkScaleY: 1, duration: 90, ease: 'Sine.easeOut' },
      ],
    });
  }

  // ── Caster (magie/religion) : channel (swell) → cast (snap release) ──
  // Pas de déplacement (évite le conflit tween mouvement) — scale uniquement.
  function animateCast(scene, sprite, tx, ty, onCast) {
    if (!sprite) { if (onCast) onCast(); return; }
    if (sprite._attacking) { if (onCast) onCast(); return; }
    sprite._attacking = true;
    const sx = sprite.x, sy = sprite.y;
    _faceTarget(sprite, tx, ty);
    _armSafety(scene, sprite, sx, sy, 350);
    scene.tweens.chain({
      targets: sprite,
      onComplete: () => _restoreAttack(scene, sprite, sx, sy),
      tweens: [
        { _atkScaleX: 1.13, _atkScaleY: 1.13, duration: 160, ease: 'Sine.easeInOut' },
        { _atkScaleX: 0.90, _atkScaleY: 0.90, duration: 70, ease: 'Quad.easeIn',
          onComplete: () => { if (onCast) onCast(); } },
        { _atkScaleX: 1, _atkScaleY: 1, duration: 120, ease: 'Sine.easeOut' },
      ],
    });
  }

  // ── Anim projectile : rotation/pulse/vibration selon type ──
  function animateProjectile(scene, sprite, projKey) {
    if (!sprite) return;
    // Rotation continue
    if (projKey === 'proj_catapult_rock') {
      scene.tweens.add({ targets: sprite, rotation: sprite.rotation + Math.PI * 2,
        duration: 800, repeat: -1, ease: 'Linear' });
    } else if (projKey === 'proj_cannonball') {
      scene.tweens.add({ targets: sprite, rotation: sprite.rotation + Math.PI * 2,
        duration: 1200, repeat: -1, ease: 'Linear' });
    } else if (projKey === 'proj_dark_orb') {
      scene.tweens.add({ targets: sprite, rotation: sprite.rotation + Math.PI * 2,
        duration: 2000, repeat: -1, ease: 'Linear' });
      scene.tweens.add({ targets: sprite, alpha: { from: 0.7, to: 1.0 },
        duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (projKey === 'proj_lightning') {
      // Vibration
      scene.tweens.add({ targets: sprite, scale: { from: 0.9, to: 1.1 },
        duration: 80, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (projKey === 'proj_magic_bolt' || projKey === 'proj_holy_bolt' || projKey === 'proj_divine_beam') {
      scene.tweens.add({ targets: sprite, alpha: { from: 0.7, to: 1.0 },
        duration: 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (projKey === 'proj_dragon_breath') {
      // Le souffle s'étale
      scene.tweens.add({ targets: sprite, scale: { from: 1.0, to: 1.2 },
        duration: 600, ease: 'Quad.easeOut' });
    }
  }

  // ── Anim de cast de sort (effet d'arrivée au point d'impact) ──
  function animateSpellCast(scene, spellId, x, y) {
    let assetKey = null, scaleAnim = null, dur = 600, hold = 0;
    if (spellId === 'fireball') {
      assetKey = 'spell_fireball';
      scaleAnim = { from: 0.5, to: 1.5 }; dur = 600;
    } else if (spellId === 'freeze') {
      assetKey = 'spell_freeze';
      scaleAnim = { from: 0.5, to: 1.0 }; dur = 500; hold = 5000;
    } else if (spellId === 'portal') {
      assetKey = 'spell_portal';
      scaleAnim = { from: 0, to: 1.0 }; dur = 400; hold = 2500;
    } else if (spellId === 'blessing') {
      assetKey = 'spell_blessing';
      scaleAnim = { from: 0.3, to: 1.0 }; dur = 500; hold = 30000;
    } else if (spellId === 'purifying_light' || spellId === 'holy_light') {
      assetKey = 'spell_holy_light';
      scaleAnim = { from: 0.3, to: 1.2 }; dur = 200; hold = 600;
      // Flash blanc fullscreen
      const cam = scene.cameras.main;
      cam.flash(120, 255, 255, 230, false);
    }
    if (!assetKey || !scene.textures.exists(assetKey)) return null;

    const sprite = scene.add.sprite(x, y, assetKey)
      .setDepth(75)
      .setAlpha(0)
      .setScale(scaleAnim.from);
    // Glow néon du sort (API FX Phaser 3.90), couleur thématique
    const spellGlowColor = (spellId === 'fireball')    ? 0xff7b33
                         : (spellId === 'freeze')      ? 0x60a5fa
                         : (spellId === 'portal')      ? 0x8b5cf6
                         : (spellId === 'blessing')    ? 0xfde047
                         : (spellId === 'holy_light' || spellId === 'purifying_light') ? 0xfef9c3
                         : 0xffffff;
    if (sprite.postFX) {
      try { sprite.postFX.addGlow(spellGlowColor, 8, 0, false, 0.1, 12); } catch (_) {}
    }
    scene.tweens.add({
      targets: sprite,
      scale: scaleAnim.to,
      alpha: { from: 0, to: 0.85 },
      duration: dur, ease: 'Quad.easeOut',
      onComplete: () => {
        // Rotation continue pour portal/blessing
        if (spellId === 'portal' || spellId === 'blessing') {
          scene.tweens.add({ targets: sprite, rotation: sprite.rotation + Math.PI * 2,
            duration: 1500, repeat: -1, ease: 'Linear' });
        }
        // Fade out après hold
        scene.time.delayedCall(hold, () => {
          scene.tweens.add({
            targets: sprite, alpha: 0, scale: sprite.scale * 0.7,
            duration: 500, onComplete: () => sprite.destroy(),
          });
        });
      },
    });
    return sprite;
  }

  // ── Anim mort d'unité ─────────────────────────────────────────
  function animateUnitDeath(scene, sprite) {
    if (!sprite) return null;
    return scene.tweens.add({
      targets: sprite, alpha: 0, scale: sprite.scale * 0.5,
      duration: 400, ease: 'Quad.easeIn',
      onComplete: () => sprite.destroy(),
    });
  }

  // ── Anim spawn (apparition par invocation) ─────────────────────
  function animateUnitSpawn(scene, sprite, type) {
    if (!sprite) return null;
    const finalScaleX = sprite.scaleX;
    const finalScaleY = sprite.scaleY;
    sprite.setAlpha(0).setScale(finalScaleX * 0.5, finalScaleY * 0.5);
    // Flash blanc fullscreen pour les boss
    if (type === 'arcane_dragon' || type === 'god_avatar') {
      scene.cameras.main.flash(200, 255, 255, 255, false);
    }
    return scene.tweens.add({
      targets: sprite,
      alpha: 1,
      scaleX: finalScaleX, scaleY: finalScaleY,
      duration: 500, ease: 'Back.easeOut',
    });
  }

  // ── Anim idle ambient permanente (boss/summoned) ───────────────
  function animateIdleAmbient(scene, sprite, type) {
    if (!sprite || sprite._idleAmbientTween) return;
    if (type === 'arcane_dragon') {
      // Ailes : rotation oscillante ±5°
      sprite._idleAmbientTween = scene.tweens.add({
        targets: sprite, angle: { from: -5, to: 5 },
        duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else if (type === 'angel') {
      // Battement d'ailes léger via oscillation d'angle (±3°). PAS de y/scale
      // car ils sont écrasés chaque frame par _syncUnits (mouvement) et
      // _updateUnitBarPositions (wobble) → entrent en conflit et l'unité
      // "tremblerait dans tous les sens" pendant le déplacement.
      sprite._idleAmbientTween = scene.tweens.add({
        targets: sprite, angle: { from: -3, to: 3 },
        duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else if (type === 'god_avatar') {
      // Pulsation lumineuse via tint
      sprite._idleAmbientTween = scene.tweens.add({
        targets: sprite, alpha: { from: 0.85, to: 1.0 },
        duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else if (type === 'fire_elemental') {
      sprite._idleAmbientTween = scene.tweens.add({
        targets: sprite, alpha: { from: 0.85, to: 1.0 },
        duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  return {
    animateUnitMove, stopUnitMove,
    animateMelee, animateDraw, animateCast,
    animateProjectile,
    animateSpellCast,
    animateUnitDeath,
    animateUnitSpawn,
    animateIdleAmbient,
  };
})();
