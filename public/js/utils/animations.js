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

  // ── Anim d'attaque : lunge mêlée OU recul léger (distance) ──
  function animateUnitAttack(scene, sprite, targetX, targetY, isRanged) {
    if (!sprite) return null;
    if (isRanged) {
      // Léger recul de 5px en arrière du tireur
      const dx = sprite.x - targetX, dy = sprite.y - targetY;
      const d = Math.hypot(dx, dy) || 1;
      const ox = (dx / d) * 5, oy = (dy / d) * 5;
      const sx = sprite.x, sy = sprite.y;
      return scene.tweens.add({
        targets: sprite,
        x: sx + ox, y: sy + oy,
        duration: 80, yoyo: true, ease: 'Quad.easeOut',
        onComplete: () => { sprite.x = sx; sprite.y = sy; },
      });
    }
    // Mêlée : lunge +10px vers la cible, retour
    const dx = targetX - sprite.x, dy = targetY - sprite.y;
    const d = Math.hypot(dx, dy) || 1;
    const ox = (dx / d) * 10, oy = (dy / d) * 10;
    const sx = sprite.x, sy = sprite.y;
    return scene.tweens.add({
      targets: sprite,
      x: sx + ox, y: sy + oy,
      duration: 100, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => { sprite.x = sx; sprite.y = sy; },
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
    animateUnitAttack,
    animateProjectile,
    animateSpellCast,
    animateUnitDeath,
    animateUnitSpawn,
    animateIdleAmbient,
  };
})();
