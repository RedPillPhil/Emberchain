import Phaser from 'phaser';
import { TEX } from '../constants';

// Font constants for consistency
const F_TITLE = '"Fredoka One", "Nunito", sans-serif';
const F_BODY  = '"Nunito", sans-serif';

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    this.load.spritesheet('player-run-r',  'assets/player-run-r.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-run-l',  'assets/player-run-l.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-idle-r', 'assets/player-idle-r.png', { frameWidth: 45,  frameHeight: 100 });
    this.load.spritesheet('player-idle-l', 'assets/player-idle-l.png', { frameWidth: 45,  frameHeight: 100 });
    this.load.spritesheet(TEX.SLUG, 'assets/cinderslug.png', { frameWidth: 32, frameHeight: 32 });
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
    this.createGeyserTexture();

    this.textures.get(TEX.SLUG).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get(TEX.GROUND).setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.anims.create({ key: 'ember-run-r',     frames: this.anims.generateFrameNumbers('player-run-r',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-run-l',     frames: this.anims.generateFrameNumbers('player-run-l',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-idle-r',    frames: this.anims.generateFrameNumbers('player-idle-r', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: 'ember-idle-l',    frames: this.anims.generateFrameNumbers('player-idle-l', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: 'cinderslug-walk', frames: this.anims.generateFrameNumbers(TEX.SLUG, { start: 0, end: 1 }), frameRate: 5, repeat: -1 });

    this.scene.start('MenuScene');
  }

  private g(_w: number, _h: number): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0, add: false });
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpColor(c1: number, c2: number, t: number): number {
    const r = Math.round(this.lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t));
    const g = Math.round(this.lerp((c1 >> 8)  & 0xff, (c2 >> 8)  & 0xff, t));
    const b = Math.round(this.lerp( c1        & 0xff,  c2        & 0xff,  t));
    return (r << 16) | (g << 8) | b;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  SKY — vivid SM3DW volcanic atmosphere, deep magenta → bright orange-gold
  // ─────────────────────────────────────────────────────────────────────────────
  private createSkyTexture() {
    const W = 854, H = 480;
    const gfx = this.g(W, H);

    // Smooth gradient — saturated magenta/crimson sky to vivid gold horizon
    const stops: Array<[number, number]> = [
      [0,   0x1E0030],   // deep violet-indigo zenith (space-like)
      [50,  0x540038],   // vivid dark magenta
      [110, 0x8C0040],   // rich crimson-magenta
      [180, 0xC01828],   // vivid deep red
      [250, 0xE03810],   // brilliant fire-orange-red
      [320, 0xF05C00],   // vivid orange
      [390, 0xF88000],   // bright amber-orange
      [440, 0xFCA400],   // golden amber
      [480, 0xFFBE00],   // horizon bright gold
    ];

    for (let i = 0; i < stops.length - 1; i++) {
      const [y1, c1] = stops[i];
      const [y2, c2] = stops[i + 1];
      const segH = y2 - y1;
      const steps = Math.ceil(segH / 2);   // 2px bands = very smooth
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        gfx.fillStyle(this.lerpColor(c1, c2, t));
        gfx.fillRect(0, Math.floor(y1 + segH * t), W, Math.ceil(segH / steps) + 1);
      }
    }

    // ── Twin suns of Scoria ──────────────────────────────────────────────────
    // Primary — large, white-gold, warm glow
    const s1x = 155, s1y = 95;
    gfx.fillStyle(0xFF8800, 0.12); gfx.fillCircle(s1x, s1y, 90);
    gfx.fillStyle(0xFFCC00, 0.22); gfx.fillCircle(s1x, s1y, 66);
    gfx.fillStyle(0xFFEE88, 0.45); gfx.fillCircle(s1x, s1y, 46);
    gfx.fillStyle(0xFFFACC, 0.80); gfx.fillCircle(s1x, s1y, 28);
    gfx.fillStyle(0xFFFFFF, 1.00); gfx.fillCircle(s1x, s1y, 15);
    // Corona rays (faint cross)
    gfx.lineStyle(2, 0xFFEE88, 0.18);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      gfx.beginPath();
      gfx.moveTo(s1x + Math.cos(a) * 50, s1y + Math.sin(a) * 50);
      gfx.lineTo(s1x + Math.cos(a) * 84, s1y + Math.sin(a) * 84);
      gfx.strokePath();
    }

    // Secondary — smaller, more orange-red, upper right
    const s2x = 700, s2y = 65;
    gfx.fillStyle(0xFF3300, 0.15); gfx.fillCircle(s2x, s2y, 52);
    gfx.fillStyle(0xFF7700, 0.30); gfx.fillCircle(s2x, s2y, 36);
    gfx.fillStyle(0xFFAA55, 0.65); gfx.fillCircle(s2x, s2y, 22);
    gfx.fillStyle(0xFFDDAA, 0.92); gfx.fillCircle(s2x, s2y, 12);
    gfx.fillStyle(0xFFFFEE, 1.00); gfx.fillCircle(s2x, s2y,  6);

    // ── Star field near zenith ───────────────────────────────────────────────
    const rng = Phaser.Math.RND;
    rng.sow(['scoria-v2']);
    for (let i = 0; i < 55; i++) {
      const sx = rng.integerInRange(0, W);
      const sy = rng.integerInRange(0, 170);
      const sa = rng.realInRange(0.15, 0.55);
      const sr = rng.realInRange(0.4, 1.8);
      gfx.fillStyle(0xFFEEFF, sa);
      gfx.fillCircle(sx, sy, sr);
    }

    // Atmospheric horizon bloom
    gfx.fillStyle(0xFF6600, 0.10); gfx.fillRect(0, 360, W, 120);
    gfx.fillStyle(0xFFAA00, 0.08); gfx.fillRect(0, 420, W, 60);

    gfx.generateTexture(TEX.BG_SKY, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  CLOUDS — vivid ember storm clouds, SM3DW brightness
  // ─────────────────────────────────────────────────────────────────────────────
  private createCloudsTexture() {
    const W = 900, H = 100;
    const gfx = this.g(W, H);

    const drawCloud = (cx: number, cy: number, sc: number, warm: boolean) => {
      const shadow = warm ? 0xAA3010 : 0x882040;
      const body   = warm ? 0xFF6020 : 0xCC3A70;
      const hi     = warm ? 0xFF9840 : 0xFF6090;
      const shine  = warm ? 0xFFDD80 : 0xFFAACC;

      gfx.fillStyle(shadow, 0.55);
      gfx.fillEllipse(cx,        cy + 9*sc, 56*sc, 26*sc);
      gfx.fillEllipse(cx+22*sc,  cy+11*sc,  42*sc, 22*sc);
      gfx.fillEllipse(cx-20*sc,  cy+11*sc,  38*sc, 20*sc);

      gfx.fillStyle(body);
      gfx.fillEllipse(cx,        cy,        52*sc, 30*sc);
      gfx.fillEllipse(cx+20*sc,  cy+ 6*sc,  40*sc, 26*sc);
      gfx.fillEllipse(cx-18*sc,  cy+ 6*sc,  36*sc, 22*sc);

      gfx.fillStyle(hi);
      gfx.fillEllipse(cx- 5*sc,  cy- 6*sc,  26*sc, 14*sc);
      gfx.fillEllipse(cx+16*sc,  cy- 3*sc,  20*sc, 11*sc);

      gfx.fillStyle(shine, 0.75);
      gfx.fillEllipse(cx- 7*sc,  cy- 9*sc,  12*sc,  7*sc);
    };

    drawCloud(100, 58, 1.00, true);
    drawCloud(350, 42, 1.25, false);
    drawCloud(620, 60, 0.90, true);
    drawCloud(850, 48, 1.10, false);

    gfx.generateTexture(TEX.BG_CLOUDS, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  FAR BG — smooth, rounded mountain silhouettes (SM3DW style)
  //  Vivid magenta/crimson palette, 3 depth layers
  // ─────────────────────────────────────────────────────────────────────────────
  private createFarBgTexture() {
    const W = 650, H = 240;
    const gfx = this.g(W, H);

    // Smooth mountain helper — 18 control points for gentle curves
    const drawMt = (cx: number, w: number, h: number, color: number, highlight: number) => {
      const base = H;
      const pts: Phaser.Types.Math.Vector2Like[] = [
        { x: cx - w/2,    y: base },
        { x: cx - w*0.47, y: base - h*0.08 },
        { x: cx - w*0.43, y: base - h*0.18 },
        { x: cx - w*0.38, y: base - h*0.32 },
        { x: cx - w*0.32, y: base - h*0.47 },
        { x: cx - w*0.24, y: base - h*0.62 },
        { x: cx - w*0.15, y: base - h*0.77 },
        { x: cx - w*0.07, y: base - h*0.91 },
        { x: cx,           y: base - h },
        { x: cx + w*0.07, y: base - h*0.91 },
        { x: cx + w*0.15, y: base - h*0.77 },
        { x: cx + w*0.24, y: base - h*0.62 },
        { x: cx + w*0.32, y: base - h*0.47 },
        { x: cx + w*0.38, y: base - h*0.32 },
        { x: cx + w*0.43, y: base - h*0.18 },
        { x: cx + w*0.47, y: base - h*0.08 },
        { x: cx + w/2,    y: base },
      ];
      gfx.fillStyle(color);
      gfx.fillPoints(pts, true);

      // Bright highlight band on left face (sun rim lighting)
      const hlPts: Phaser.Types.Math.Vector2Like[] = pts.slice(0, 9);
      hlPts.push({ x: cx - w*0.08, y: base - h*0.45 });
      gfx.fillStyle(highlight, 0.22);
      gfx.fillPoints(hlPts, true);

      // Glowing summit vent
      gfx.fillStyle(0xFF4400, 0.6); gfx.fillCircle(cx, base - h + 5, 9);
      gfx.fillStyle(0xFF9900, 0.8); gfx.fillCircle(cx, base - h + 5, 5);
      gfx.fillStyle(0xFFDD00, 1.0); gfx.fillCircle(cx, base - h + 5, 2);
    };

    // Layer 1 — furthest, darkest violet-purple
    drawMt( 80,  210, 185, 0x38084A, 0xFF88FF);
    drawMt(250,  240, 210, 0x44094E, 0xFF88FF);
    drawMt(420,  220, 192, 0x3C0848, 0xFF88FF);
    drawMt(600,  210, 178, 0x42094C, 0xFF88FF);

    // Layer 2 — mid, vivid crimson-magenta
    drawMt(110,  190, 162, 0x8C1050, 0xFFBBDD);
    drawMt(300,  220, 185, 0x9E1858, 0xFFBBDD);
    drawMt(480,  200, 170, 0x921450, 0xFFBBDD);
    drawMt(640,  185, 158, 0x880E4C, 0xFFBBDD);

    // Layer 3 — nearest, vivid coral-crimson
    drawMt( 55,  175, 145, 0xC82040, 0xFFCCCC);
    drawMt(210,  205, 172, 0xD82848, 0xFFCCCC);
    drawMt(395,  190, 158, 0xCC2040, 0xFFCCCC);
    drawMt(570,  178, 148, 0xC41E3C, 0xFFCCCC);

    // Lava glow base
    gfx.fillStyle(0xFF2200, 0.28); gfx.fillRect(0, H - 24, W, 24);
    gfx.fillStyle(0xFF7700, 0.22); gfx.fillRect(0, H - 12, W, 12);
    gfx.fillStyle(0xFFAA00, 0.15); gfx.fillRect(0, H -  5, W,  5);

    gfx.generateTexture(TEX.BG_FAR, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  MID BG — vivid coral-orange spires with lava vents — closer, more detail
  // ─────────────────────────────────────────────────────────────────────────────
  private createMidBgTexture() {
    const W = 820, H = 200;
    const gfx = this.g(W, H);

    const drawSpire = (cx: number, w: number, h: number, color: number, hiColor: number) => {
      const base = H;
      const pts: Phaser.Types.Math.Vector2Like[] = [
        { x: cx - w/2,    y: base },
        { x: cx - w*0.45, y: base - h*0.20 },
        { x: cx - w*0.38, y: base - h*0.40 },
        { x: cx - w*0.28, y: base - h*0.58 },
        { x: cx - w*0.17, y: base - h*0.74 },
        { x: cx - w*0.08, y: base - h*0.88 },
        { x: cx,           y: base - h },
        { x: cx + w*0.08, y: base - h*0.88 },
        { x: cx + w*0.17, y: base - h*0.74 },
        { x: cx + w*0.28, y: base - h*0.58 },
        { x: cx + w*0.38, y: base - h*0.40 },
        { x: cx + w*0.45, y: base - h*0.20 },
        { x: cx + w/2,    y: base },
      ];
      gfx.fillStyle(color);
      gfx.fillPoints(pts, true);

      // Left-face bright highlight (rim lit by primary sun)
      const hlPts = pts.slice(0, 7).concat([{ x: cx - w*0.12, y: base - h*0.35 }]);
      gfx.fillStyle(hiColor, 0.28);
      gfx.fillPoints(hlPts, true);

      // Dark right shadow
      const shPts = [{ x: cx, y: base - h }, ...pts.slice(7)];
      gfx.fillStyle(0x000000, 0.18);
      gfx.fillPoints(shPts, true);

      // Glowing lava vent at tip
      gfx.fillStyle(0xFF3300, 0.75); gfx.fillCircle(cx, base - h + 5, 8);
      gfx.fillStyle(0xFF8800, 0.90); gfx.fillCircle(cx, base - h + 5, 5);
      gfx.fillStyle(0xFFCC00, 1.00); gfx.fillCircle(cx, base - h + 5, 2.5);

      // Lava trickle streak
      gfx.lineStyle(2, 0xFF6600, 0.45);
      gfx.beginPath();
      gfx.moveTo(cx + 2,  base - h + 10);
      gfx.lineTo(cx + 6,  base - h*0.65);
      gfx.lineTo(cx + 4,  base - h*0.38);
      gfx.strokePath();
    };

    // Back layer — taller, darker coral-red
    drawSpire( 50,  82, 155, 0xAA2C14, 0xFF9966);
    drawSpire(175, 100, 180, 0xB83018, 0xFF9966);
    drawSpire(310,  90, 165, 0xAA2C14, 0xFF9966);
    drawSpire(450, 105, 188, 0xB43018, 0xFF9966);
    drawSpire(595,  88, 158, 0xAA2C14, 0xFF9966);
    drawSpire(735,  98, 170, 0xB23018, 0xFF9966);

    // Front layer — shorter, vivid bright coral-orange
    drawSpire(112,  72, 128, 0xE84424, 0xFFCC88);
    drawSpire(248,  85, 148, 0xF04C28, 0xFFCC88);
    drawSpire(385,  78, 135, 0xE84020, 0xFFCC88);
    drawSpire(520,  90, 152, 0xEC4824, 0xFFCC88);
    drawSpire(660,  80, 140, 0xE84020, 0xFFCC88);
    drawSpire(800,  68, 118, 0xE03C1C, 0xFFCC88);

    // Lava river base
    gfx.fillStyle(0xFF3300, 0.32); gfx.fillRect(0, H - 14, W, 14);
    gfx.fillStyle(0xFF7700, 0.28); gfx.fillRect(0, H -  6, W,  6);
    gfx.fillStyle(0xFFBB00, 0.20); gfx.fillRect(0, H -  2, W,  2);

    gfx.generateTexture(TEX.BG_MID, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  NEAR BG — vivid ember grass, iridium crystals, char rocks
  // ─────────────────────────────────────────────────────────────────────────────
  private createNearBgTexture() {
    const W = 700, H = 72;
    const gfx = this.g(W, H);

    // Rolling dirt base — vivid warm-red
    gfx.fillStyle(0xCC3A10); gfx.fillRect(0, 24, W, H);

    // Undulating top edge
    for (let x = 0; x < W; x += 4) {
      const bump = Math.sin(x * 0.06) * 4 + Math.sin(x * 0.17) * 2;
      gfx.fillStyle(0xE85020);
      gfx.fillRect(x, 16 + Math.floor(bump), 4, 14);
    }

    // Bright trim
    gfx.fillStyle(0xFF7030); gfx.fillRect(0, 14, W, 5);
    // Vivid top gleam
    gfx.fillStyle(0xFF9840); gfx.fillRect(0, 12, W, 3);
    // White-hot edge
    gfx.fillStyle(0xFFDD80); gfx.fillRect(0, 11, W, 2);

    // Ember grass tufts — vivid orange-yellow
    for (let x = 2; x < W - 10; x += 16) {
      const phase = (x * 11) % 5;
      const h = 10 + phase * 2;
      // Shadow tuft
      gfx.fillStyle(0x9A1C08, 0.6);
      gfx.fillTriangle(x + 3, 13, x + 7, 13 - h + 2, x + 13, 13);
      // Main tuft — vivid orange
      gfx.fillStyle(0xFF5510);
      gfx.fillTriangle(x, 13, x + 5, 13 - h, x + 11, 13);
      // Bright tip
      gfx.fillStyle(0xFFBB30);
      gfx.fillTriangle(x + 1, 13 - h + 5, x + 5, 13 - h - 2, x + 9, 13 - h + 5);
      // Glowing ember at tip
      if (phase > 1) {
        gfx.fillStyle(0xFFFF80, 0.9);
        gfx.fillCircle(x + 5, 13 - h - 2, 1.8);
      }
    }

    // Dark char boulders
    for (let x = 40; x < W - 20; x += 88) {
      const rx = x + (x % 19);
      const rw = 14 + (x % 8);
      gfx.fillStyle(0x2A0A04);
      gfx.fillEllipse(rx, 20, rw, 9);
      gfx.fillStyle(0x4A180C, 0.55);
      gfx.fillEllipse(rx - 2, 18, rw * 0.6, 5);
    }

    // Iridium crystal clusters — vivid cyan-blue
    for (let x = 32; x < W - 10; x += 66) {
      const cx = x + (x % 15);
      gfx.fillStyle(0x88EEFF);
      gfx.fillTriangle(cx, 4, cx - 5, 14, cx + 5, 14);
      gfx.fillStyle(0x44CCFF);
      gfx.fillTriangle(cx + 7, 6, cx + 3, 14, cx + 12, 14);
      // Crystal shine
      gfx.fillStyle(0xFFFFFF, 0.9);
      gfx.fillTriangle(cx - 1, 6, cx + 1, 4, cx + 2, 7);
      // Base glow
      gfx.fillStyle(0x66DDFF, 0.45);
      gfx.fillCircle(cx + 4, 15, 6);
    }

    gfx.generateTexture(TEX.BG_NEAR, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PLATFORMS — bright SM3DW-style volcanic rock with vivid lava glow
  // ─────────────────────────────────────────────────────────────────────────────
  private createPlatformTextures() {
    const drawPlatform = (w: number, key: string, isHigh = false) => {
      const H = 24;
      const gfx = this.g(w, H);

      if (isHigh) {
        // Crystal iridium platform — cool vivid teal-violet
        gfx.fillStyle(0x2820B0); gfx.fillRect(0, 0, w, H);
        gfx.fillStyle(0x1818A0); gfx.fillRect(2, 6, w - 4, H - 8);
        // Top rim — bright vivid teal
        gfx.fillStyle(0x5080E8); gfx.fillRect(0, 0, w, 6);
        gfx.fillStyle(0x88BBFF); gfx.fillRect(0, 0, w, 2);
        // Crystal facets
        for (let x = 10; x < w - 8; x += 18) {
          gfx.fillStyle(0xBBDDFF, 0.8);
          gfx.fillTriangle(x, 0, x + 9, 0, x + 4, 8);
          gfx.fillStyle(0xFFFFFF, 0.6);
          gfx.fillTriangle(x + 1, 0, x + 4, 0, x + 2, 3);
        }
        // Bottom lume glow
        gfx.fillStyle(0x4466DD, 0.7); gfx.fillRect(0, H - 4, w, 4);
        gfx.fillStyle(0x99BBFF, 0.5); gfx.fillRect(0, H - 2, w, 2);
        gfx.generateTexture(key, w, H);
        gfx.destroy();
        return;
      }

      // ── Volcanic rock shelf — vivid SM3DW style ─────────────────────────

      // Main rock body — warm vivid rust-orange
      gfx.fillStyle(0x8C3C14); gfx.fillRect(0, 0, w, H);

      // Strata bands (horizontal colour shift for depth)
      gfx.fillStyle(0xA04820, 0.6); gfx.fillRect(0,  7, w, 3);
      gfx.fillStyle(0x6A2C0C, 0.4); gfx.fillRect(0, 15, w, 2);

      // Dark underside
      gfx.fillStyle(0x3A1206); gfx.fillRect(0, H - 7, w, 7);

      // VIVID lava seam — the key SM3DW brightness
      gfx.fillStyle(0xFF2200, 0.80); gfx.fillRect(0, H - 5, w, 5);
      gfx.fillStyle(0xFF7700, 0.70); gfx.fillRect(0, H - 3, w, 3);
      gfx.fillStyle(0xFFCC00, 0.55); gfx.fillRect(0, H - 1, w, 1);

      // Top surface — bright vivid amber
      gfx.fillStyle(0xD86028); gfx.fillRect(0, 0, w, 8);
      // Gleam strip
      gfx.fillStyle(0xFF9840); gfx.fillRect(0, 0, w, 3);
      // White-hot edge
      gfx.fillStyle(0xFFEE88); gfx.fillRect(0, 0, w, 1);

      // Rock texture bumps on top surface
      for (let x = 6; x < w - 4; x += 12) {
        gfx.fillStyle(0xB84C20, 0.55);
        gfx.fillRect(x, 3, 7, 4);
        gfx.fillStyle(0xE87040, 0.35);
        gfx.fillRect(x, 3, 7, 1);
      }

      // Iridium deposits — vivid cyan
      for (let x = 18; x < w - 12; x += 34) {
        gfx.fillStyle(0x88EEFF);
        gfx.fillRect(x,     1, 3, 5);
        gfx.fillRect(x + 4, 2, 2, 3);
        gfx.fillStyle(0xFFFFFF, 0.9);
        gfx.fillRect(x, 1, 3, 1);
      }

      // Cracks
      gfx.lineStyle(1, 0x3C1208, 0.50);
      for (let x = 24; x < w - 18; x += 42) {
        gfx.beginPath();
        gfx.moveTo(x, 8); gfx.lineTo(x + 5, 14);
        gfx.moveTo(x + 3, 14); gfx.lineTo(x + 7, 20);
        gfx.strokePath();
      }

      // Vivid lava hotspots on underside
      for (let x = 30; x < w - 20; x += 50) {
        gfx.fillStyle(0xFF4400, 0.55);
        gfx.fillEllipse(x + 8, H - 3, 20, 6);
        gfx.fillStyle(0xFF9900, 0.65);
        gfx.fillEllipse(x + 8, H - 2, 10, 3);
      }

      gfx.generateTexture(key, w, H);
      gfx.destroy();
    };

    drawPlatform(96,  TEX.PLAT_S);
    drawPlatform(192, TEX.PLAT_M);
    drawPlatform(288, TEX.PLAT_L);
    drawPlatform(192, TEX.PLAT_HIGH, true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  COINS — vivid iridium shards
  // ─────────────────────────────────────────────────────────────────────────────
  private createCoinTextures() {
    const drawCoin = (key: string, glowColor: number, outerColor: number) => {
      const gfx = this.g(20, 20);
      gfx.fillStyle(glowColor, 0.30); gfx.fillCircle(10, 10, 10);
      gfx.fillStyle(outerColor);      gfx.fillCircle(10, 10, 8);
      gfx.fillStyle(0xf6f6fc);        gfx.fillCircle(10, 10, 6);
      gfx.fillStyle(0xffffff);        gfx.fillCircle( 8,  8, 3);
      gfx.fillStyle(0xaabbd0, 0.9);   gfx.fillRect(9, 5, 2, 9);
      gfx.generateTexture(key, 20, 20);
      gfx.destroy();
    };
    drawCoin(TEX.COIN,      0x88AAFF, 0xCCCCE8);   // silver-iridium
    drawCoin(TEX.COIN_HIGH, 0xBB44FF, 0xCC88FF);   // purple (unreachable)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PORTAL
  // ─────────────────────────────────────────────────────────────────────────────
  private createPortalTexture() {
    const gfx = this.g(48, 80);
    gfx.fillStyle(0x3d1a0a); gfx.fillRect(0, 10, 8, 70); gfx.fillRect(40, 10, 8, 70);
    gfx.fillStyle(0x4c1d95, 0.75); gfx.fillRect(8, 5, 32, 75);
    gfx.fillStyle(0x7c3aed, 0.85); gfx.fillEllipse(24, 42, 30, 60);
    gfx.fillStyle(0xa78bfa, 0.75); gfx.fillEllipse(24, 42, 22, 46);
    gfx.fillStyle(0xc4b5fd, 0.85); gfx.fillEllipse(24, 42, 14, 30);
    gfx.fillStyle(0xffffff, 0.92); gfx.fillEllipse(24, 42, 6, 14);
    gfx.fillStyle(0x3d1a0a);  gfx.fillRect(0, 0, 48, 12);
    gfx.fillStyle(0x8b2e0e);  gfx.fillRect(4, 2, 40, 6);
    gfx.fillStyle(0x5a1e08);
    gfx.fillRect(0, 0, 12, 12); gfx.fillRect(36, 0, 12, 12);
    gfx.generateTexture(TEX.PORTAL, 48, 80);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  COLLECTOR
  // ─────────────────────────────────────────────────────────────────────────────
  private createCollectorTexture() {
    const gfx = this.g(48, 64);
    gfx.fillStyle(0x100505); gfx.fillRect(4, 16, 40, 48);
    gfx.fillStyle(0x1e0a0a); gfx.fillRect(8, 20, 32, 42);
    gfx.fillStyle(0x4a0808); gfx.fillRect(2, 16, 12, 14); gfx.fillRect(34, 16, 12, 14);
    gfx.lineStyle(1, 0x990000); gfx.strokeRect(2, 16, 12, 14); gfx.strokeRect(34, 16, 12, 14);
    gfx.fillStyle(0x1a0808); gfx.fillRect(10, 4, 28, 18);
    gfx.fillStyle(0x3d0a0a); gfx.fillRect(12, 2, 24, 8);
    gfx.fillStyle(0xff0000); gfx.fillCircle(18, 12, 4); gfx.fillCircle(30, 12, 4);
    gfx.fillStyle(0xff6666); gfx.fillCircle(18, 11, 2); gfx.fillCircle(30, 11, 2);
    gfx.fillStyle(0x8b6914); gfx.fillCircle(34, 50, 10);
    gfx.fillStyle(0xffd700, 0.6); gfx.fillCircle(34, 48, 7);
    gfx.fillStyle(0x5a3800); gfx.fillRect(30, 40, 8, 6);
    gfx.fillStyle(0x100505);
    for (let x = 4; x < 44; x += 8) gfx.fillTriangle(x, 64, x + 4, 58, x + 8, 64);
    gfx.generateTexture(TEX.COLLECTOR, 48, 64);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  GEYSER BASE
  // ─────────────────────────────────────────────────────────────────────────────
  private createGeyserTexture() {
    const W = 32, H = 40;
    const gfx = this.g(W, H);
    gfx.fillStyle(0x2A0800); gfx.fillEllipse(16, 36, 30, 12);
    gfx.fillStyle(0xFF2200, 0.80); gfx.fillEllipse(16, 36, 20, 7);
    gfx.fillStyle(0xFF8800, 0.95); gfx.fillEllipse(16, 36, 11, 4);
    gfx.fillStyle(0xFFDD00, 1.00); gfx.fillEllipse(16, 36, 5, 2);
    gfx.lineStyle(1, 0xFF5500, 0.65);
    gfx.beginPath();
    gfx.moveTo(4, 32);  gfx.lineTo(10, 36);
    gfx.moveTo(28, 31); gfx.lineTo(22, 36);
    gfx.moveTo(14, 28); gfx.lineTo(13, 34);
    gfx.strokePath();
    gfx.generateTexture('geyser-base', W, H);
    gfx.destroy();
  }
}

export { F_TITLE, F_BODY };
