import Phaser from 'phaser';
import { TEX } from '../constants';

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    // ── Real animated character sprites (modern style, warm-tinted in GameScene) ──
    this.load.spritesheet('player-run-r',  'assets/player-run-r.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-run-l',  'assets/player-run-l.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-idle-r', 'assets/player-idle-r.png', { frameWidth: 45,  frameHeight: 100 });
    this.load.spritesheet('player-idle-l', 'assets/player-idle-l.png', { frameWidth: 45,  frameHeight: 100 });
    // ── Cinderslug enemy (2-frame walk, extracted from classic tileset) ──────────
    this.load.spritesheet(TEX.SLUG, 'assets/cinderslug.png', { frameWidth: 32, frameHeight: 32 });
    // ── Volcanic ground tile (warm-tinted brick from classic tileset) ─────────────
    this.load.image(TEX.GROUND, 'assets/ground-tile.png');
  }

  create() {
    this.createSkyTexture();
    this.createCloudsTexture();
    this.createFarBgTexture();
    this.createMidBgTexture();
    this.createNearBgTexture();
    this.createPlatformTextures();
    this.createCoinTextures();
    this.createPortalTexture();
    this.createCollectorTexture();

    // ── Use nearest-neighbour filtering for pixel-art tiles ───────────────────────
    this.textures.get(TEX.SLUG).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get(TEX.GROUND).setFilter(Phaser.Textures.FilterMode.NEAREST);

    // ── Global animations (available in every scene) ──────────────────────────────
    this.anims.create({ key: 'ember-run-r',  frames: this.anims.generateFrameNumbers('player-run-r',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-run-l',  frames: this.anims.generateFrameNumbers('player-run-l',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-idle-r', frames: this.anims.generateFrameNumbers('player-idle-r', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: 'ember-idle-l', frames: this.anims.generateFrameNumbers('player-idle-l', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: 'cinderslug-walk', frames: this.anims.generateFrameNumbers(TEX.SLUG, { start: 0, end: 1 }), frameRate: 5, repeat: -1 });

    this.scene.start('MenuScene');
  }

  private g(w: number, h: number): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0, add: false });
  }

  private createSkyTexture() {
    // Vivid Scoria sky: deep burnt-orange at zenith → bright gold at horizon
    const gfx = this.g(854, 480);
    const bands: [number, number][] = [
      [0xB83A00, 60],  // deep volcanic orange-red
      [0xD05200, 60],  // flame orange
      [0xE86C00, 60],  // bright amber-orange
      [0xF08400, 60],  // golden amber
      [0xF89C00, 60],  // warm gold
      [0xFCB400, 60],  // bright gold
      [0xFACC00, 60],  // yellow-gold
      [0xF8E000, 60],  // radiant horizon glow
    ];
    let y = 0;
    for (const [color, h] of bands) {
      gfx.fillStyle(color); gfx.fillRect(0, y, 854, h); y += h;
    }
    gfx.generateTexture(TEX.BG_SKY, 854, 480);
    gfx.destroy();
  }

  private createCloudsTexture() {
    // Puffy ember clouds — golden-orange, tiled 800px wide
    const W = 800, H = 100;
    const gfx = this.g(W, H);
    // Three cloud clusters spaced across the tile
    const drawCloud = (cx: number, cy: number, scale: number) => {
      // Shadow layer
      gfx.fillStyle(0xCC5A00, 0.5);
      gfx.fillEllipse(cx,      cy + 8 * scale, 54 * scale, 26 * scale);
      gfx.fillEllipse(cx + 22 * scale, cy + 10 * scale, 42 * scale, 22 * scale);
      gfx.fillEllipse(cx - 18 * scale, cy + 10 * scale, 40 * scale, 20 * scale);
      // Main body
      gfx.fillStyle(0xFF9A30);
      gfx.fillEllipse(cx,      cy,            50 * scale, 30 * scale);
      gfx.fillEllipse(cx + 20 * scale, cy + 6 * scale, 38 * scale, 24 * scale);
      gfx.fillEllipse(cx - 16 * scale, cy + 6 * scale, 36 * scale, 22 * scale);
      // Top highlight
      gfx.fillStyle(0xFFD050);
      gfx.fillEllipse(cx - 4 * scale, cy - 4 * scale, 26 * scale, 14 * scale);
      gfx.fillEllipse(cx + 18 * scale, cy - 2 * scale, 18 * scale, 10 * scale);
      // Tiny shine
      gfx.fillStyle(0xFFF0A0);
      gfx.fillEllipse(cx - 6 * scale, cy - 6 * scale, 10 * scale, 6 * scale);
    };
    drawCloud(120, 55, 1.0);
    drawCloud(380, 40, 1.3);
    drawCloud(620, 60, 0.85);
    gfx.generateTexture(TEX.BG_CLOUDS, W, H);
    gfx.destroy();
  }

  private createFarBgTexture() {
    // Distant rounded volcanic formations — vivid jewel colours, tiled 500px wide
    // Inspired by the colourful egg-rock formations in NSMB Wii
    const W = 500, H = 220;
    const gfx = this.g(W, H);

    // Draw big rounded formations in rich, saturated colours
    const formations: [number, number, number, number][] = [
      // [color, cx, cy, r]
      [0x9A2080, 80,  H, 80],   // magenta-purple
      [0xC03060, 200, H, 100],  // vivid pink-red
      [0xE05020, 340, H, 90],   // coral orange
      [0xB02870, 440, H, 70],   // rich magenta
      [0xD04840, 500, H, 85],   // tomato
      [0x8A1870, 0,   H, 60],   // deep purple
    ];
    for (const [color, cx, cy, r] of formations) {
      // Base colour
      gfx.fillStyle(color);
      gfx.fillCircle(cx, cy, r);
      // Lighter top cap (rim lighting from the twin suns)
      gfx.fillStyle(0xFFB860, 0.25);
      gfx.fillEllipse(cx - r * 0.15, cy - r * 0.55, r * 1.1, r * 0.5);
      // Lava vein crack
      gfx.lineStyle(2, 0xFF8800, 0.7);
      gfx.beginPath();
      gfx.moveTo(cx - 6, cy - r * 0.7);
      gfx.lineTo(cx, cy - r * 0.3);
      gfx.lineTo(cx + 8, cy - r * 0.6);
      gfx.strokePath();
      // Glowing lava pool at base
      gfx.fillStyle(0xFF6600, 0.6);
      gfx.fillEllipse(cx, cy + r * 0.15, r * 0.6, 16);
      gfx.fillStyle(0xFFCC00, 0.4);
      gfx.fillEllipse(cx, cy + r * 0.15, r * 0.3, 8);
    }
    // Outline for depth
    gfx.lineStyle(2, 0x000000, 0.15);
    for (const [, cx, cy, r] of formations) {
      gfx.strokeCircle(cx, cy, r);
    }
    gfx.generateTexture(TEX.BG_FAR, W, H);
    gfx.destroy();
  }

  private createMidBgTexture() {
    // Mid-distance rounded spire formations — warm reds and oranges
    const W = 700, H = 160;
    const gfx = this.g(W, H);
    const spires: [number, number, number, number, number][] = [
      [0xC84820, 80,  H, 55, 130],  // cx,cy,rx,ry
      [0xE06030, 220, H, 70, 160],
      [0xD05028, 370, H, 60, 140],
      [0xB83818, 490, H, 50, 120],
      [0xD86838, 600, H, 65, 150],
      [0xC04020, 700, H, 55, 130],
    ];
    for (const [color, cx, cy, rx, ry] of spires) {
      gfx.fillStyle(color);
      gfx.fillEllipse(cx, cy, rx * 2, ry * 2);
      // Top highlight
      gfx.fillStyle(0xFFAA40, 0.3);
      gfx.fillEllipse(cx - rx * 0.2, cy - ry * 0.5, rx * 1.0, ry * 0.4);
      // Lava glow at top
      gfx.fillStyle(0xFF8800, 0.5);
      gfx.fillCircle(cx, cy - ry * 0.8, 8);
      gfx.fillStyle(0xFFDD00, 0.7);
      gfx.fillCircle(cx, cy - ry * 0.8, 4);
    }
    gfx.generateTexture(TEX.BG_MID, W, H);
    gfx.destroy();
  }

  private createNearBgTexture() {
    // Close decorative volcanic grass / shrubs — vivid warm strip
    const W = 600, H = 60;
    const gfx = this.g(W, H);
    // Rolling hill base
    gfx.fillStyle(0xD06020);
    gfx.fillRect(0, 20, W, H);
    // Bright top edge (like Mario's green top stripe)
    gfx.fillStyle(0xFF8C30);
    gfx.fillRect(0, 16, W, 8);
    // Golden glowing lip
    gfx.fillStyle(0xFFCC40);
    gfx.fillRect(0, 14, W, 4);
    // Ember grass tufts
    for (let x = 0; x < W; x += 22) {
      const h = 8 + (x % 3) * 4;
      gfx.fillStyle(0xFF6010);
      gfx.fillTriangle(x, 14, x + 5, 14 - h, x + 11, 14);
      gfx.fillStyle(0xFFAA30);
      gfx.fillTriangle(x + 2, 14, x + 6, 14 - h + 3, x + 10, 14);
    }
    // Small glowing flowers / iridium crystals
    for (let x = 30; x < W; x += 80) {
      gfx.fillStyle(0xC0F0FF);
      gfx.fillCircle(x, 12, 4);
      gfx.fillStyle(0x80D8FF);
      gfx.fillCircle(x, 12, 2);
    }
    gfx.generateTexture(TEX.BG_NEAR, W, H);
    gfx.destroy();
  }

  private createPlatformTextures() {
    const drawPlatform = (w: number, key: string, isHigh = false) => {
      const H = 24;
      const gfx = this.g(w, H);
      if (isHigh) {
        // Unreachable — cool blue-purple tint, slightly transparent look
        gfx.fillStyle(0x6030A0); gfx.fillRect(0, 0, w, H);
        gfx.fillStyle(0x8050C8); gfx.fillRect(0, 0, w, 5);
        gfx.fillStyle(0xC090FF); gfx.fillRect(0, 0, w, 2);
        gfx.fillStyle(0x000000, 0.3); gfx.fillRect(0, H - 3, w, 3);
        gfx.lineStyle(1, 0x4020708.toString() as unknown as number);
        gfx.generateTexture(key, w, H);
        gfx.destroy();
        return;
      }
      // Warm rust-orange volcanic rock shelf
      gfx.fillStyle(0xA85828); gfx.fillRect(0, 0, w, H);
      // Underside darker
      gfx.fillStyle(0x7A3810); gfx.fillRect(0, H - 6, w, 6);
      // Top surface — bright amber
      gfx.fillStyle(0xD47838); gfx.fillRect(0, 0, w, 6);
      // Gleaming top edge (golden glow)
      gfx.fillStyle(0xFFB840); gfx.fillRect(0, 0, w, 2);
      // Iridium crystal deposits along top
      for (let x = 12; x < w - 8; x += 32) {
        gfx.fillStyle(0xC8E8FF, 0.8);
        gfx.fillRect(x, 1, 4, 3);
      }
      // Crack lines
      gfx.lineStyle(1, 0x6A2C08, 0.6);
      gfx.beginPath();
      for (let x = 24; x < w - 12; x += 48) {
        gfx.moveTo(x, 6); gfx.lineTo(x + 8, 18); gfx.moveTo(x + 22, 4); gfx.lineTo(x + 16, 20);
      }
      gfx.strokePath();
      gfx.generateTexture(key, w, H);
      gfx.destroy();
    };
    drawPlatform(96,  TEX.PLAT_S);
    drawPlatform(192, TEX.PLAT_M);
    drawPlatform(288, TEX.PLAT_L);
    drawPlatform(192, TEX.PLAT_HIGH, true);
  }

  private createCoinTextures() {
    // Normal Iridium coin — 20 × 20
    const drawCoin = (key: string, glowColor: number, outerColor: number) => {
      const gfx = this.g(20, 20);
      // Glow
      gfx.fillStyle(glowColor, 0.25); gfx.fillCircle(10, 10, 10);
      // Coin body
      gfx.fillStyle(outerColor); gfx.fillCircle(10, 10, 8);
      // Inner shine
      gfx.fillStyle(0xf0f0f0); gfx.fillCircle(10, 10, 6);
      // Center highlight
      gfx.fillStyle(0xffffff); gfx.fillCircle(8, 8, 3);
      // "I" for Iridium
      gfx.fillStyle(0xa0a0a0, 0.8);
      gfx.fillRect(9, 6, 2, 8);
      gfx.generateTexture(key, 20, 20);
      gfx.destroy();
    };
    drawCoin(TEX.COIN,      0xc0c8ff, 0xc8c8d0);  // silver-white
    drawCoin(TEX.COIN_HIGH, 0xc040ff, 0xd090ff);  // purple tint = unreachable
  }

  private createPortalTexture() {
    // End portal: 48 × 80
    const gfx = this.g(48, 80);
    // Gate posts
    gfx.fillStyle(0x3d1a0a); gfx.fillRect(0, 10, 8, 70); gfx.fillRect(40, 10, 8, 70);
    // Portal glow bg
    gfx.fillStyle(0x4c1d95, 0.7); gfx.fillRect(8, 5, 32, 75);
    // Portal swirl layers
    gfx.fillStyle(0x7c3aed, 0.8); gfx.fillEllipse(24, 42, 30, 60);
    gfx.fillStyle(0xa78bfa, 0.7); gfx.fillEllipse(24, 42, 22, 46);
    gfx.fillStyle(0xc4b5fd, 0.8); gfx.fillEllipse(24, 42, 14, 30);
    gfx.fillStyle(0xffffff, 0.9); gfx.fillEllipse(24, 42, 6, 14);
    // Top arch
    gfx.fillStyle(0x3d1a0a);
    gfx.fillRect(0, 0, 48, 12);
    gfx.fillStyle(0x8b2e0e);
    gfx.fillRect(4, 2, 40, 6);
    // Cap stones
    gfx.fillStyle(0x5a1e08);
    gfx.fillRect(0, 0, 12, 12); gfx.fillRect(36, 0, 12, 12);
    gfx.generateTexture(TEX.PORTAL, 48, 80);
    gfx.destroy();
  }

  private createCollectorTexture() {
    // Char Collector — 48 × 64
    const gfx = this.g(48, 64);
    // Cape / cloak — dark
    gfx.fillStyle(0x100505); gfx.fillRect(4, 16, 40, 48);
    // Cloak inner
    gfx.fillStyle(0x1e0a0a); gfx.fillRect(8, 20, 32, 42);
    // Armor shoulder plates
    gfx.fillStyle(0x4a0808); gfx.fillRect(2, 16, 12, 14); gfx.fillRect(34, 16, 12, 14);
    // Red trim on armor
    gfx.lineStyle(1, 0x990000); gfx.strokeRect(2, 16, 12, 14); gfx.strokeRect(34, 16, 12, 14);
    // Head / helmet
    gfx.fillStyle(0x1a0808); gfx.fillRect(10, 4, 28, 18);
    gfx.fillStyle(0x3d0a0a); gfx.fillRect(12, 2, 24, 8);
    // Glowing red eyes
    gfx.fillStyle(0xff0000); gfx.fillCircle(18, 12, 4); gfx.fillCircle(30, 12, 4);
    gfx.fillStyle(0xff6666); gfx.fillCircle(18, 11, 2); gfx.fillCircle(30, 11, 2);
    // Eye glow halo
    gfx.lineStyle(1, 0xff000088.toString() as unknown as number);
    gfx.strokeCircle(18, 12, 6); gfx.strokeCircle(30, 12, 6);
    // Coin bag
    gfx.fillStyle(0x8b6914); gfx.fillCircle(34, 50, 10);
    gfx.fillStyle(0xffd700, 0.6); gfx.fillCircle(34, 48, 7);
    gfx.fillStyle(0x5a3800); gfx.fillRect(30, 40, 8, 6);
    // Cloak bottom jagged edge
    gfx.fillStyle(0x100505);
    for (let x = 4; x < 44; x += 8) {
      gfx.fillTriangle(x, 64, x + 4, 58, x + 8, 64);
    }
    gfx.generateTexture(TEX.COLLECTOR, 48, 64);
    gfx.destroy();
  }
}
