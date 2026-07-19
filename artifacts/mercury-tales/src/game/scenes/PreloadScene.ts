import Phaser from 'phaser';
import { TEX } from '../constants';

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  create() {
    this.createSkyTexture();
    this.createFarBgTexture();
    this.createNearBgTexture();
    this.createGroundTile();
    this.createPlatformTextures();
    this.createPlayerTexture();
    this.createCoinTextures();
    this.createSlugTexture();
    this.createPortalTexture();
    this.createCollectorTexture();
    this.scene.start('MenuScene');
  }

  private g(w: number, h: number): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0, add: false });
  }

  private createSkyTexture() {
    const gfx = this.g(854, 480);
    // Gradient bands: near-black top → deep dark-red at bottom
    const bands = [
      [0x050002, 60], [0x0a0305, 60], [0x120506, 60],
      [0x1a0708, 60], [0x230a09, 60], [0x2d0d0a, 60],
      [0x380f0b, 60], [0x420f0a, 60],
    ] as [number, number][];
    let y = 0;
    for (const [color, h] of bands) {
      gfx.fillStyle(color);
      gfx.fillRect(0, y, 854, h);
      y += h;
    }
    gfx.generateTexture(TEX.BG_SKY, 854, 480);
    gfx.destroy();
  }

  private createFarBgTexture() {
    // Distant volcanic mountain silhouettes — tiled 400px wide
    const W = 400, H = 200;
    const gfx = this.g(W, H);
    gfx.fillStyle(0x1a0508, 1);
    // Several overlapping triangular peaks
    const peaks: [number, number, number][] = [
      [0, H, 120, 20, 240, H],
      [80, H, 200, 40, 320, H],
      [200, H, 330, 10, 400, H],
      [280, H, 380, 55, 400, H],
    ];
    for (const [x1,y1,x2,y2,x3,y3] of peaks) {
      gfx.fillTriangle(x1, y1, x2, y2, x3, y3);
    }
    // Lava cracks — bright orange lines
    gfx.lineStyle(1, 0xff4400, 0.4);
    gfx.beginPath();
    gfx.moveTo(100, H); gfx.lineTo(115, 80); gfx.lineTo(130, H);
    gfx.moveTo(290, H); gfx.lineTo(330, 30); gfx.lineTo(360, H);
    gfx.strokePath();
    gfx.generateTexture(TEX.BG_FAR, W, H);
    gfx.destroy();
  }

  private createNearBgTexture() {
    // Closer rock formations and steam vents — tiled 600px wide
    const W = 600, H = 120;
    const gfx = this.g(W, H);
    gfx.fillStyle(0x0e0408, 1);
    // Jagged rocks
    const rocks: number[][] = [
      [0, H, 40, 50, 100, H],
      [60, H, 130, 30, 200, H],
      [170, H, 230, 60, 290, H],
      [280, H, 340, 20, 410, H],
      [380, H, 450, 45, 510, H],
      [480, H, 540, 15, 600, H],
    ];
    for (const [x1,y1,x2,y2,x3,y3] of rocks) {
      gfx.fillTriangle(x1, y1, x2, y2, x3, y3);
    }
    // Rock top highlights
    gfx.lineStyle(1, 0x3d1010, 0.6);
    gfx.beginPath();
    gfx.moveTo(0, H); gfx.lineTo(40, 50); gfx.lineTo(100, H);
    gfx.moveTo(280, H); gfx.lineTo(340, 20); gfx.lineTo(410, H);
    gfx.strokePath();
    gfx.generateTexture(TEX.BG_NEAR, W, H);
    gfx.destroy();
  }

  private createGroundTile() {
    const gfx = this.g(32, 32);
    // Dark volcanic rock base
    gfx.fillStyle(0x1c1008);
    gfx.fillRect(0, 0, 32, 32);
    // Slightly lighter top edge
    gfx.fillStyle(0x2e1a0d);
    gfx.fillRect(0, 0, 32, 6);
    // Orange-red top strip (surface layer — hot rock)
    gfx.fillStyle(0x5a1e08);
    gfx.fillRect(0, 0, 32, 3);
    // Glow highlight on surface
    gfx.fillStyle(0x8b2e0e, 0.4);
    gfx.fillRect(0, 0, 32, 1);
    // Random cracks / texture variation
    gfx.lineStyle(1, 0x0a0604, 0.7);
    gfx.beginPath();
    gfx.moveTo(8, 6); gfx.lineTo(12, 20); gfx.moveTo(22, 8); gfx.lineTo(18, 25);
    gfx.moveTo(0, 15); gfx.lineTo(6, 22); gfx.moveTo(26, 12); gfx.lineTo(32, 18);
    gfx.strokePath();
    gfx.generateTexture(TEX.GROUND, 32, 32);
    gfx.destroy();
  }

  private createPlatformTextures() {
    const drawPlatform = (w: number, key: string, alpha = false) => {
      const H = 24;
      const gfx = this.g(w, H);
      // Base rock
      gfx.fillStyle(alpha ? 0x1a1030 : 0x180e06);
      gfx.fillRect(0, 0, w, H);
      // Top bright strip
      gfx.fillStyle(alpha ? 0x4a2080 : 0x3d1a0a);
      gfx.fillRect(0, 0, w, 5);
      // Hot glowing top edge
      gfx.fillStyle(alpha ? 0x7c3aed : 0x8b2e0e, 0.5);
      gfx.fillRect(0, 0, w, 2);
      // Bottom shadow
      gfx.fillStyle(0x000000, 0.5);
      gfx.fillRect(0, H - 3, w, 3);
      // Crack details
      gfx.lineStyle(1, alpha ? 0x0a0820 : 0x0a0604, 0.6);
      gfx.beginPath();
      for (let x = 20; x < w - 10; x += 40) {
        gfx.moveTo(x, 5); gfx.lineTo(x + 6, 18); gfx.moveTo(x + 20, 5); gfx.lineTo(x + 14, 18);
      }
      gfx.strokePath();
      gfx.generateTexture(key, w, H);
      gfx.destroy();
    };
    drawPlatform(96,  TEX.PLAT_S);
    drawPlatform(192, TEX.PLAT_M);
    drawPlatform(288, TEX.PLAT_L);
    drawPlatform(192, TEX.PLAT_HIGH, true);  // unreachable platforms have purple tint
  }

  private createPlayerTexture() {
    // Ember Apprentice — adult, 40×64
    // Style: bold cartoon (Mario-esque solid shapes + outlines)
    // Design: spiky black hair, steampunk goggles on forehead, red scarf/cape,
    //         worn leather harness over cream shirt, dark pants, heavy boots,
    //         ember gauntlet on left arm, battle scar, stubble.
    const W = 40, H = 64;
    const gfx = this.g(W, H);

    // ── RED SCARF / CAPE (behind everything — drawn first) ────────────────
    gfx.fillStyle(0xbb1111);
    // Flowing cape trailing left (when character runs right)
    gfx.fillTriangle(0, 22, 13, 24, 4, 50);
    gfx.fillTriangle(4, 50, 13, 24, 8, 58);
    gfx.fillTriangle(8, 58, 13, 24, 1, 63);
    // Darker torn-edge shading
    gfx.fillStyle(0x880b0b);
    gfx.fillTriangle(1, 48, 6, 52, 2, 56);
    gfx.fillTriangle(5, 56, 9, 60, 3, 63);
    // Ember rune on cape
    gfx.fillStyle(0xff4400);
    gfx.fillCircle(5, 40, 3);
    gfx.fillStyle(0xff8800);
    gfx.fillCircle(5, 40, 1);

    // ── BOOTS (heavy, dark brown) ─────────────────────────────────────────
    gfx.fillStyle(0x231208);
    gfx.fillRect(5, 52, 13, 12);
    gfx.fillEllipse(11, 64, 18, 8);
    gfx.fillRect(22, 52, 13, 12);
    gfx.fillEllipse(29, 64, 18, 8);
    // Boot surface sheen
    gfx.fillStyle(0x3a2010);
    gfx.fillRect(6, 53, 4, 10);
    gfx.fillRect(23, 53, 4, 10);
    // Buckle straps
    gfx.fillStyle(0x5a3214);
    gfx.fillRect(5, 55, 13, 2);
    gfx.fillRect(22, 55, 13, 2);
    // Brass buckles
    gfx.fillStyle(0xc8901c);
    gfx.fillRect(10, 55, 4, 2);
    gfx.fillRect(27, 55, 4, 2);

    // ── DARK PANTS ────────────────────────────────────────────────────────
    gfx.fillStyle(0x1c1728);
    gfx.fillRect(8, 42, 24, 12);
    // Outer-leg highlight
    gfx.fillStyle(0x28203a);
    gfx.fillRect(8, 42, 5, 11);
    gfx.fillRect(27, 42, 5, 11);

    // ── BELT ──────────────────────────────────────────────────────────────
    gfx.fillStyle(0x442008);
    gfx.fillRect(8, 40, 24, 4);
    // Brass buckle
    gfx.fillStyle(0xc8901c);
    gfx.fillRect(17, 41, 6, 2);
    // Belt pouches
    gfx.fillStyle(0x34180a);
    gfx.fillRect(8, 40, 5, 5);
    gfx.fillRect(27, 40, 5, 5);
    gfx.fillStyle(0xc8901c);
    gfx.fillRect(9, 41, 3, 2);
    gfx.fillRect(28, 41, 3, 2);

    // ── TORSO / SHIRT (worn cream) ────────────────────────────────────────
    gfx.fillStyle(0xc0986a);
    gfx.fillRect(10, 24, 20, 18);
    // Dirty worn patches
    gfx.fillStyle(0xa88055);
    gfx.fillRect(11, 25, 6, 4);
    gfx.fillRect(23, 31, 5, 5);

    // ── LEATHER CHEST HARNESS ─────────────────────────────────────────────
    gfx.fillStyle(0x2c1006);
    gfx.fillRect(10, 29, 20, 3);   // horizontal strap
    gfx.fillRect(18, 24, 4, 18);   // vertical spine strap
    // Harness clasp (center)
    gfx.fillStyle(0x7a481a);
    gfx.fillRect(16, 28, 8, 4);
    // EMBER EMBLEM on chest (glowing orange circle)
    gfx.fillStyle(0xff5500);
    gfx.fillCircle(20, 36, 4);
    gfx.fillStyle(0xff9900);
    gfx.fillCircle(20, 36, 2);
    gfx.fillStyle(0xffee88);
    gfx.fillCircle(20, 36, 1);

    // ── LEFT ARM + LEATHER GLOVE (character's right — sprite left side) ───
    gfx.fillStyle(0xba8858);   // arm skin
    gfx.fillRect(3, 25, 8, 14);
    // Glove
    gfx.fillStyle(0x34180a);
    gfx.fillRect(2, 36, 10, 9);
    gfx.fillStyle(0x4e2810);
    gfx.fillRect(3, 37, 7, 7);
    // Knuckle rivets
    gfx.fillStyle(0x8a6420);
    gfx.fillRect(3, 37, 2, 2);
    gfx.fillRect(6, 37, 2, 2);
    gfx.fillRect(9, 37, 2, 2);

    // ── RIGHT ARM + EMBER GAUNTLET (character's left — sprite right side) ─
    gfx.fillStyle(0xba8858);
    gfx.fillRect(29, 25, 8, 14);
    // Heavy gauntlet casing
    gfx.fillStyle(0x2c1006);
    gfx.fillRect(28, 34, 12, 12);
    gfx.fillStyle(0x44200a);
    gfx.fillRect(29, 35, 9, 10);
    // Vent lines
    gfx.fillStyle(0x180802);
    gfx.fillRect(30, 36, 7, 1);
    gfx.fillRect(30, 38, 7, 1);
    gfx.fillRect(30, 40, 7, 1);
    // GLOWING EMBER CORE
    gfx.fillStyle(0xff4400);
    gfx.fillCircle(34, 43, 4);
    gfx.fillStyle(0xff8800);
    gfx.fillCircle(34, 43, 2);
    gfx.fillStyle(0xffee44);
    gfx.fillCircle(34, 43, 1);
    // Outer glow ring
    gfx.lineStyle(1, 0xff4400);
    gfx.strokeCircle(34, 43, 6);

    // ── SCARF FRONT WRAP (over shirt, around neck) ────────────────────────
    gfx.fillStyle(0xcc1515);
    gfx.fillRect(10, 22, 20, 5);    // neck wrap
    // Scarf knot hanging to character's right (sprite right = char's left)
    gfx.fillStyle(0xe81c1c);
    gfx.fillEllipse(27, 23, 8, 7);
    // Scarf shadow fold
    gfx.fillStyle(0x990e0e);
    gfx.fillRect(10, 25, 9, 3);

    // ── HEAD (adult proportions — less big-head, stronger jaw) ────────────
    gfx.fillStyle(0xc08858);    // warm adult skin tone
    gfx.fillEllipse(20, 14, 20, 17);
    gfx.fillRect(11, 15, 18, 7);   // widen jaw area

    // ── SPIKY BLACK HAIR ──────────────────────────────────────────────────
    gfx.fillStyle(0x0e0a06);
    // Hair base
    gfx.fillEllipse(20, 10, 22, 13);
    // Five wild spikes
    gfx.fillTriangle(6,  10, 10,  0, 14, 10);
    gfx.fillTriangle(12,  7, 16, -2, 20,  8);
    gfx.fillTriangle(18,  5, 22, -4, 26,  6);
    gfx.fillTriangle(24,  7, 29, -1, 32,  8);
    gfx.fillTriangle(29, 10, 34,  2, 36, 11);
    // Sideburns
    gfx.fillRect(8, 11, 4, 7);
    gfx.fillRect(28, 11, 4, 7);
    // Subtle hair sheen
    gfx.fillStyle(0x1e140c);
    gfx.fillRect(15, 4, 7, 5);

    // ── STEAMPUNK GOGGLES (pushed up on forehead, over hair) ──────────────
    // Goggle strap
    gfx.fillStyle(0x3e2208);
    gfx.fillRect(7, 8, 26, 3);
    // Brass frames
    gfx.fillStyle(0x9a5e1c);
    gfx.fillEllipse(16, 9, 12, 9);
    gfx.fillEllipse(26, 9, 12, 9);
    // Bridge
    gfx.fillStyle(0x7a481a);
    gfx.fillRect(19, 8, 4, 3);
    // Dark lenses
    gfx.fillStyle(0x100814);
    gfx.fillEllipse(16, 9, 8, 6);
    gfx.fillEllipse(26, 9, 8, 6);
    // Red lens glow (powered/active)
    gfx.fillStyle(0xe01400);
    gfx.fillEllipse(16, 9, 5, 4);
    gfx.fillEllipse(26, 9, 5, 4);
    // Lens highlight
    gfx.fillStyle(0xff7060);
    gfx.fillCircle(14, 8, 1);
    gfx.fillCircle(24, 8, 1);
    // Frame rivets
    gfx.fillStyle(0xd4a830);
    gfx.fillCircle(11, 9, 1);
    gfx.fillCircle(21, 9, 1);
    gfx.fillCircle(23, 9, 1);
    gfx.fillCircle(31, 9, 1);

    // ── FACE FEATURES ─────────────────────────────────────────────────────
    // Brows — thick, slightly furrowed inward for adult determination
    gfx.fillStyle(0x0e0a06);
    gfx.fillRect(13, 14, 6, 2);
    gfx.fillRect(21, 14, 6, 2);
    gfx.fillRect(13, 15, 2, 1);   // inner brow drop (stern)
    gfx.fillRect(25, 15, 2, 1);

    // Eyes — adult narrower
    gfx.fillStyle(0x140e0a);
    gfx.fillEllipse(16, 17, 5, 4);
    gfx.fillEllipse(25, 17, 5, 4);
    // Iris — warm amber-brown
    gfx.fillStyle(0x7a3c0a);
    gfx.fillEllipse(16, 17, 3, 3);
    gfx.fillEllipse(25, 17, 3, 3);
    // Catchlight
    gfx.fillStyle(0xffffff);
    gfx.fillCircle(17, 16, 1);
    gfx.fillCircle(26, 16, 1);

    // Nose (adult — triangular, defined)
    gfx.fillStyle(0xa07048);
    gfx.fillTriangle(19, 19, 21, 19, 20, 22);
    gfx.fillStyle(0x886038);
    gfx.fillCircle(19, 22, 1);
    gfx.fillCircle(21, 22, 1);

    // Smirk (confident, one side raised)
    gfx.lineStyle(1, 0x7a4820, 1);
    gfx.beginPath();
    gfx.moveTo(14, 24); gfx.lineTo(19, 23); gfx.lineTo(23, 25);
    gfx.strokePath();

    // Battle scar (right cheek — shows history)
    gfx.lineStyle(1, 0xb07858, 1);
    gfx.beginPath();
    gfx.moveTo(24, 16); gfx.lineTo(27, 21);
    gfx.strokePath();

    // Stubble (5 o'clock shadow, adult marker)
    gfx.fillStyle(0x6a3e28);
    for (let sx = 13; sx <= 27; sx += 2) { gfx.fillRect(sx, 25, 1, 1); }
    for (let sx = 14; sx <= 26; sx += 2) { gfx.fillRect(sx, 26, 1, 1); }

    // ── BOLD OUTLINES (Mario-style clarity) ───────────────────────────────
    gfx.lineStyle(1, 0x080402, 1);
    gfx.strokeEllipse(20, 14, 20, 17);      // head
    gfx.strokeRect(10, 24, 20, 18);         // torso
    gfx.strokeRect(3, 25, 8, 20);           // left arm
    gfx.strokeRect(29, 25, 8, 20);          // right arm
    gfx.strokeRect(5, 52, 13, 12);          // left boot
    gfx.strokeRect(22, 52, 13, 12);         // right boot
    gfx.strokeEllipse(16, 9, 12, 9);        // left goggle
    gfx.strokeEllipse(26, 9, 12, 9);        // right goggle

    gfx.generateTexture(TEX.PLAYER, W, H);
    gfx.destroy();
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

  private createSlugTexture() {
    // Cinderslug: 32 × 22
    const gfx = this.g(32, 22);
    // Body — orange-red blob
    gfx.fillStyle(0xcc4400); gfx.fillEllipse(16, 14, 30, 18);
    // Darker underside
    gfx.fillStyle(0x882200); gfx.fillEllipse(16, 18, 28, 10);
    // Eyes
    gfx.fillStyle(0xffdd00); gfx.fillCircle(10, 9, 4); gfx.fillCircle(22, 9, 4);
    gfx.fillStyle(0x220000); gfx.fillCircle(11, 9, 2); gfx.fillCircle(23, 9, 2);
    gfx.fillStyle(0xffffff); gfx.fillCircle(10, 8, 1); gfx.fillCircle(22, 8, 1);
    // Tiny mouth
    gfx.lineStyle(1, 0x220000, 1);
    gfx.beginPath(); gfx.arc(16, 15, 4, 0, Math.PI, false); gfx.strokePath();
    // Highlight
    gfx.lineStyle(1, 0xff6600, 0.5);
    gfx.beginPath(); gfx.arc(16, 12, 12, Math.PI * 1.1, Math.PI * 1.9, false); gfx.strokePath();
    gfx.generateTexture(TEX.SLUG, 32, 22);
    gfx.destroy();
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
