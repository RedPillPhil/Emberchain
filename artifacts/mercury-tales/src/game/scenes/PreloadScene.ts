import Phaser from 'phaser';
import { TEX } from '../constants';

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    // ── Real animated character sprites ──────────────────────────────────────────
    this.load.spritesheet('player-run-r',  'assets/player-run-r.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-run-l',  'assets/player-run-l.png',  { frameWidth: 85,  frameHeight: 100 });
    this.load.spritesheet('player-idle-r', 'assets/player-idle-r.png', { frameWidth: 45,  frameHeight: 100 });
    this.load.spritesheet('player-idle-l', 'assets/player-idle-l.png', { frameWidth: 45,  frameHeight: 100 });
    // ── Cinderslug enemy ─────────────────────────────────────────────────────────
    this.load.spritesheet(TEX.SLUG, 'assets/cinderslug.png', { frameWidth: 32, frameHeight: 32 });
    // ── Volcanic ground tile ──────────────────────────────────────────────────────
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

    // Nearest-neighbour for pixel-art
    this.textures.get(TEX.SLUG).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get(TEX.GROUND).setFilter(Phaser.Textures.FilterMode.NEAREST);

    // ── Global animations ─────────────────────────────────────────────────────────
    this.anims.create({ key: 'ember-run-r',      frames: this.anims.generateFrameNumbers('player-run-r',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-run-l',      frames: this.anims.generateFrameNumbers('player-run-l',  { start: 0, end: 29 }), frameRate: 22, repeat: -1 });
    this.anims.create({ key: 'ember-idle-r',     frames: this.anims.generateFrameNumbers('player-idle-r', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: 'ember-idle-l',     frames: this.anims.generateFrameNumbers('player-idle-l', { start: 0, end: 29 }), frameRate: 14, repeat: -1 });
    this.anims.create({ key: 'cinderslug-walk',  frames: this.anims.generateFrameNumbers(TEX.SLUG, { start: 0, end: 1 }), frameRate: 5, repeat: -1 });

    this.scene.start('MenuScene');
  }

  // ── Helper: make a headless Graphics ─────────────────────────────────────────
  private g(_w: number, _h: number): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0, add: false });
  }

  // ── Colour interpolation util ─────────────────────────────────────────────────
  private lerpColor(c1: number, c2: number, t: number): number {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  SKY — deep volcanic atmosphere, twin suns
  // ─────────────────────────────────────────────────────────────────────────────
  private createSkyTexture() {
    const W = 854, H = 480;
    const gfx = this.g(W, H);

    // Smooth gradient via interpolated bands (3px each)
    const stops: Array<[number, number]> = [
      [0,   0x130010],   // deep violet-black zenith
      [60,  0x3D0020],   // dark blood-crimson
      [130, 0x7A0010],   // rich crimson
      [200, 0xB52000],   // deep flame-orange
      [280, 0xD84800],   // vivid fire orange
      [360, 0xED7000],   // warm amber-orange
      [420, 0xF89800],   // bright gold
      [480, 0xFFBB00],   // horizon gold
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [y1, c1] = stops[i];
      const [y2, c2] = stops[i + 1];
      const segH = y2 - y1;
      const steps = Math.ceil(segH / 3);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const y = Math.floor(y1 + segH * t);
        const h = Math.ceil(segH / steps) + 1;
        gfx.fillStyle(this.lerpColor(c1, c2, t));
        gfx.fillRect(0, y, W, h);
      }
    }

    // ── Twin suns of Scoria ──────────────────────────────────────────────────
    // Primary sun — large white-gold, upper-left
    const s1x = 160, s1y = 105;
    gfx.fillStyle(0xFFCC00, 0.15); gfx.fillCircle(s1x, s1y, 72);  // halo
    gfx.fillStyle(0xFFEE80, 0.30); gfx.fillCircle(s1x, s1y, 52);
    gfx.fillStyle(0xFFFF88, 0.55); gfx.fillCircle(s1x, s1y, 36);
    gfx.fillStyle(0xFFFFCC, 0.85); gfx.fillCircle(s1x, s1y, 22);
    gfx.fillStyle(0xFFFFFF, 1.00); gfx.fillCircle(s1x, s1y, 13);

    // Secondary sun — smaller, orange-tinted, upper-right area
    const s2x = 680, s2y = 72;
    gfx.fillStyle(0xFF7700, 0.18); gfx.fillCircle(s2x, s2y, 48);
    gfx.fillStyle(0xFFAA40, 0.38); gfx.fillCircle(s2x, s2y, 32);
    gfx.fillStyle(0xFFCC88, 0.70); gfx.fillCircle(s2x, s2y, 19);
    gfx.fillStyle(0xFFEECC, 1.00); gfx.fillCircle(s2x, s2y, 10);

    // ── Faint star field near zenith ─────────────────────────────────────────
    const rng = Phaser.Math.RND;
    rng.sow(['scoria-stars']);
    for (let i = 0; i < 40; i++) {
      const sx = rng.integerInRange(0, W);
      const sy = rng.integerInRange(0, 160);
      const sa = rng.realInRange(0.2, 0.6);
      const sr = rng.realInRange(0.5, 1.5);
      gfx.fillStyle(0xFFEEDD, sa);
      gfx.fillCircle(sx, sy, sr);
    }

    // ── Atmospheric haze near horizon ─────────────────────────────────────────
    gfx.fillStyle(0xFF8800, 0.12); gfx.fillRect(0, 380, W, 100);
    gfx.fillStyle(0xFFCC00, 0.08); gfx.fillRect(0, 430, W, 50);

    gfx.generateTexture(TEX.BG_SKY, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  CLOUDS — dramatic ember storm clouds
  // ─────────────────────────────────────────────────────────────────────────────
  private createCloudsTexture() {
    const W = 900, H = 110;
    const gfx = this.g(W, H);

    const drawCloud = (cx: number, cy: number, sc: number, dark: boolean) => {
      const base = dark ? 0x7A2800 : 0xCC5A10;
      const mid  = dark ? 0xAA3C10 : 0xFF8830;
      const top  = dark ? 0xCC5018 : 0xFFB050;
      const shin = dark ? 0xFF8040 : 0xFFE880;

      // Shadow base
      gfx.fillStyle(base, 0.6);
      gfx.fillEllipse(cx,         cy + 10*sc, 58*sc, 28*sc);
      gfx.fillEllipse(cx + 24*sc, cy + 12*sc, 44*sc, 24*sc);
      gfx.fillEllipse(cx - 20*sc, cy + 12*sc, 40*sc, 22*sc);
      // Main body
      gfx.fillStyle(mid);
      gfx.fillEllipse(cx,         cy,          54*sc, 32*sc);
      gfx.fillEllipse(cx + 22*sc, cy + 7*sc,   40*sc, 26*sc);
      gfx.fillEllipse(cx - 18*sc, cy + 7*sc,   38*sc, 24*sc);
      // Top highlight
      gfx.fillStyle(top);
      gfx.fillEllipse(cx - 4*sc, cy - 5*sc,   28*sc, 16*sc);
      gfx.fillEllipse(cx + 18*sc, cy - 3*sc,  20*sc, 12*sc);
      // Shine
      gfx.fillStyle(shin, 0.7);
      gfx.fillEllipse(cx - 7*sc, cy - 8*sc,   12*sc, 7*sc);
    };

    drawCloud(110, 60, 1.0, false);
    drawCloud(360, 42, 1.3, true);
    drawCloud(600, 65, 0.9, false);
    drawCloud(820, 50, 1.1, true);

    gfx.generateTexture(TEX.BG_CLOUDS, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  FAR BG — proper silhouette mountain range (not circles)
  // ─────────────────────────────────────────────────────────────────────────────
  private createFarBgTexture() {
    const W = 600, H = 240;
    const gfx = this.g(W, H);

    interface MtDef { cx: number; pts: number[][]; color: number }

    const drawMt = (cx: number, w: number, h: number, color: number, jagged = false) => {
      const base = H;
      // Silhouette shape with a jagged ridgeline
      const pts: Phaser.Types.Math.Vector2Like[] = [
        { x: cx - w/2, y: base },
        { x: cx - w*0.42, y: base - h*0.28 },
      ];
      if (jagged) {
        pts.push({ x: cx - w*0.30, y: base - h*0.52 });
        pts.push({ x: cx - w*0.22, y: base - h*0.42 }); // notch
        pts.push({ x: cx - w*0.12, y: base - h*0.78 });
        pts.push({ x: cx,           y: base - h });
        pts.push({ x: cx + w*0.10, y: base - h*0.72 });
        pts.push({ x: cx + w*0.20, y: base - h*0.85 }); // secondary peak
        pts.push({ x: cx + w*0.30, y: base - h*0.62 });
      } else {
        pts.push({ x: cx - w*0.20, y: base - h*0.65 });
        pts.push({ x: cx - w*0.06, y: base - h*0.88 });
        pts.push({ x: cx,           y: base - h });
        pts.push({ x: cx + w*0.10, y: base - h*0.82 });
        pts.push({ x: cx + w*0.25, y: base - h*0.60 });
      }
      pts.push({ x: cx + w*0.40, y: base - h*0.24 });
      pts.push({ x: cx + w/2,    y: base });
      gfx.fillStyle(color);
      gfx.fillPoints(pts, true);
    };

    // Back layer — darkest, most distant
    drawMt( 60,  190, 175, 0x280A30);
    drawMt(210,  240, 205, 0x350C3A, true);
    drawMt(390,  220, 188, 0x2C0832);
    drawMt(550,  200, 172, 0x320A38);

    // Middle layer — slightly brighter purple-crimson
    drawMt(100,  170, 155, 0x5A1050);
    drawMt(270,  210, 178, 0x6A1458, true);
    drawMt(440,  195, 165, 0x621250);
    drawMt(590,  175, 148, 0x5C1050);

    // Front layer — warm red-purple
    drawMt(50,   150, 130, 0x8C1A40);
    drawMt(195,  190, 162, 0x9C2248, true);
    drawMt(370,  175, 150, 0x941E44);
    drawMt(535,  160, 138, 0x881A40);

    // Lava glow at mountain bases
    gfx.fillStyle(0xFF3300, 0.22); gfx.fillRect(0, H - 22, W, 22);
    gfx.fillStyle(0xFF7700, 0.18); gfx.fillRect(0, H - 12, W, 12);
    gfx.fillStyle(0xFFAA00, 0.12); gfx.fillRect(0, H - 5,  W, 5);

    // Lava glow hints at visible mountain tips
    for (const [cx, hy] of [[210, 205], [270, 178], [370, 162], [440, 165], [590, 148]]) {
      const ty = H - (hy as number);
      gfx.fillStyle(0xFF5500, 0.45); gfx.fillCircle(cx as number, ty + 6, 10);
      gfx.fillStyle(0xFFAA00, 0.65); gfx.fillCircle(cx as number, ty + 6, 5);
    }

    gfx.generateTexture(TEX.BG_FAR, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  MID BG — jagged volcanic spires with glowing lava vents
  // ─────────────────────────────────────────────────────────────────────────────
  private createMidBgTexture() {
    const W = 800, H = 200;
    const gfx = this.g(W, H);

    const drawSpire = (cx: number, w: number, h: number, color: number) => {
      const base = H;
      const pts: Phaser.Types.Math.Vector2Like[] = [
        { x: cx - w/2, y: base },
        { x: cx - w*0.40, y: base - h*0.30 },
        { x: cx - w*0.28, y: base - h*0.52 },
        { x: cx - w*0.14, y: base - h*0.75 },
        { x: cx - w*0.04, y: base - h*0.92 },
        { x: cx,           y: base - h },      // tip
        { x: cx + w*0.06, y: base - h*0.90 },
        { x: cx + w*0.16, y: base - h*0.70 },
        { x: cx + w*0.30, y: base - h*0.48 },
        { x: cx + w*0.42, y: base - h*0.25 },
        { x: cx + w/2,    y: base },
      ];
      gfx.fillStyle(color);
      gfx.fillPoints(pts, true);

      // Darker face shading (left side shadow)
      const shadow = pts.slice(0, 6);
      gfx.fillStyle(0x000000, 0.25);
      gfx.fillPoints(shadow.concat([{ x: cx, y: base }]), true);

      // Lava vent glow at tip
      gfx.fillStyle(0xFF4400, 0.6); gfx.fillCircle(cx, base - h + 4, 7);
      gfx.fillStyle(0xFF8800, 0.8); gfx.fillCircle(cx, base - h + 4, 4);
      gfx.fillStyle(0xFFCC00, 0.9); gfx.fillCircle(cx, base - h + 4, 2);

      // Lava streak running down the spire face
      gfx.lineStyle(2, 0xFF6600, 0.5);
      gfx.beginPath();
      gfx.moveTo(cx, base - h + 8);
      gfx.lineTo(cx + 5, base - h*0.6);
      gfx.lineTo(cx + 3, base - h*0.3);
      gfx.strokePath();
    };

    // Back spires — darker, taller
    drawSpire( 55, 80,  148, 0x8C2A14);
    drawSpire(175, 100, 175, 0x9A3018);
    drawSpire(310, 90,  160, 0x8A2C14);
    drawSpire(450, 105, 182, 0x963018);
    drawSpire(590, 88,  155, 0x8C2A14);
    drawSpire(730, 95,  165, 0x982E16);

    // Front spires — brighter, shorter, different phase
    drawSpire(115, 70,  120, 0xC84820);
    drawSpire(255, 82,  138, 0xD45228);
    drawSpire(390, 75,  128, 0xC84C20);
    drawSpire(520, 88,  145, 0xD05020);
    drawSpire(665, 78,  132, 0xCC4C20);
    drawSpire(790, 65,  115, 0xC04018);

    // Lava river at base of spires
    gfx.fillStyle(0xFF3300, 0.3);  gfx.fillRect(0, H - 12, W, 12);
    gfx.fillStyle(0xFF7700, 0.25); gfx.fillRect(0, H - 5,  W, 5);

    gfx.generateTexture(TEX.BG_MID, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  NEAR BG — detailed ember grass with iridium crystals and char rocks
  // ─────────────────────────────────────────────────────────────────────────────
  private createNearBgTexture() {
    const W = 700, H = 70;
    const gfx = this.g(W, H);

    // Rolling dirt base
    gfx.fillStyle(0xA03010); gfx.fillRect(0, 22, W, H);

    // Wavy top edge (rough terrain outline)
    for (let x = 0; x < W; x += 4) {
      const bump = Math.sin(x * 0.07) * 3 + Math.sin(x * 0.19) * 2;
      gfx.fillStyle(0xC84020);
      gfx.fillRect(x, 14 + Math.floor(bump), 4, 12);
    }

    // Bright top strip
    gfx.fillStyle(0xE86030); gfx.fillRect(0, 12, W, 5);
    // Gleaming lip
    gfx.fillStyle(0xFF9040); gfx.fillRect(0, 10, W, 3);
    // Golden edge glow
    gfx.fillStyle(0xFFCC50); gfx.fillRect(0, 9, W, 2);

    // Ember grass tufts
    for (let x = 2; x < W - 10; x += 18) {
      const phase = (x * 13) % 5;
      const h = 9 + phase * 2;
      // Shadow tuft
      gfx.fillStyle(0x8A2010, 0.7);
      gfx.fillTriangle(x + 2, 12, x + 6, 12 - h + 2, x + 12, 12);
      // Main tuft
      gfx.fillStyle(0xFF5010);
      gfx.fillTriangle(x, 12, x + 5, 12 - h, x + 10, 12);
      // Bright tip
      gfx.fillStyle(0xFFAA30);
      gfx.fillTriangle(x + 1, 12 - h + 4, x + 5, 12 - h - 1, x + 8, 12 - h + 4);
      // Ember particle at tip (glowing dot)
      if (phase > 2) {
        gfx.fillStyle(0xFFFF80, 0.8);
        gfx.fillCircle(x + 5, 12 - h - 1, 1.5);
      }
    }

    // Char rocks scattered on ground
    for (let x = 35; x < W - 20; x += 95) {
      const rx = x + (x % 23);
      const rw = 12 + (x % 8);
      gfx.fillStyle(0x3A1008);
      gfx.fillEllipse(rx, 18, rw, 8);
      gfx.fillStyle(0x5A1C10, 0.6);
      gfx.fillEllipse(rx - 2, 16, rw * 0.6, 5);
    }

    // Iridium crystal clusters
    for (let x = 28; x < W - 10; x += 72) {
      const cx = x + (x % 17);
      // Crystal spike 1
      gfx.fillStyle(0xC0EEFF);
      gfx.fillTriangle(cx, 5, cx - 4, 14, cx + 4, 14);
      // Crystal spike 2
      gfx.fillStyle(0x80CCFF);
      gfx.fillTriangle(cx + 6, 7, cx + 3, 14, cx + 10, 14);
      // Inner shine
      gfx.fillStyle(0xFFFFFF, 0.8);
      gfx.fillTriangle(cx - 1, 7, cx, 5, cx + 1, 7);
      // Base glow
      gfx.fillStyle(0x80CCFF, 0.4);
      gfx.fillCircle(cx + 3, 15, 5);
    }

    gfx.generateTexture(TEX.BG_NEAR, W, H);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PLATFORMS — volcanic rock shelves with lava seams and stalactites
  // ─────────────────────────────────────────────────────────────────────────────
  private createPlatformTextures() {
    const drawPlatform = (w: number, key: string, isHigh = false) => {
      const H = 24;
      const gfx = this.g(w, H);

      if (isHigh) {
        // Iridium crystal platforms — cool blue-violet
        gfx.fillStyle(0x3020A0); gfx.fillRect(0, 0, w, H);
        // Darker core
        gfx.fillStyle(0x2018808); gfx.fillRect(2, 4, w - 4, H - 6);
        // Top rim — bright teal-violet
        gfx.fillStyle(0x7060D8); gfx.fillRect(0, 0, w, 5);
        gfx.fillStyle(0xA898F0); gfx.fillRect(0, 0, w, 2);
        // Crystal facets on top
        for (let x = 10; x < w - 8; x += 18) {
          gfx.fillStyle(0xD0C8FF, 0.7);
          gfx.fillTriangle(x, 0, x + 9, 0, x + 4, 7);
          gfx.fillStyle(0xFFFFFF, 0.5);
          gfx.fillTriangle(x + 1, 0, x + 4, 0, x + 2, 3);
        }
        // Glow seam at bottom
        gfx.fillStyle(0x6040CC, 0.6); gfx.fillRect(0, H - 4, w, 4);
        gfx.fillStyle(0xC0A0FF, 0.4); gfx.fillRect(0, H - 2, w, 2);
        // Bottom shadow
        gfx.fillStyle(0x000000, 0.4); gfx.fillRect(0, H - 2, w, 2);
        gfx.generateTexture(key, w, H);
        gfx.destroy();
        return;
      }

      // ── Volcanic rock shelf ────────────────────────────────────────────────

      // Main rock body — dark rust
      gfx.fillStyle(0x7A3412); gfx.fillRect(0, 0, w, H);

      // Rock strata bands (horizontal layers)
      gfx.fillStyle(0x8A3C18, 0.7); gfx.fillRect(0, 6, w, 3);
      gfx.fillStyle(0x6A2C0E, 0.5); gfx.fillRect(0, 14, w, 2);

      // Dark underside with lava glow
      gfx.fillStyle(0x3E1606); gfx.fillRect(0, H - 7, w, 7);
      // Lava seam along bottom — visible heat seeping out
      gfx.fillStyle(0xFF2200, 0.55); gfx.fillRect(0, H - 4, w, 4);
      gfx.fillStyle(0xFF6600, 0.45); gfx.fillRect(0, H - 2, w, 2);
      gfx.fillStyle(0xFFAA00, 0.30); gfx.fillRect(0, H - 1, w, 1);

      // Top surface — bright amber-rust
      gfx.fillStyle(0xC05C28); gfx.fillRect(0, 0, w, 7);
      // Gleam edge
      gfx.fillStyle(0xFF9040); gfx.fillRect(0, 0, w, 2);
      gfx.fillStyle(0xFFCC60); gfx.fillRect(0, 0, w, 1);

      // Rock bumps along top surface
      for (let x = 6; x < w - 4; x += 13) {
        gfx.fillStyle(0x9A4820, 0.6);
        gfx.fillRect(x, 2, 8, 4);
        gfx.fillStyle(0xD06834, 0.4);
        gfx.fillRect(x, 2, 8, 1);
      }

      // Iridium crystal veins
      for (let x = 16; x < w - 12; x += 36) {
        gfx.fillStyle(0xC8EEFF);
        gfx.fillRect(x,     1, 2, 4);
        gfx.fillRect(x + 4, 2, 2, 3);
        gfx.fillStyle(0xFFFFFF, 0.8);
        gfx.fillRect(x, 1, 2, 1);
      }

      // Crack lines through rock body
      gfx.lineStyle(1, 0x3A1208, 0.55);
      for (let x = 22; x < w - 18; x += 40) {
        gfx.beginPath();
        gfx.moveTo(x,     7);  gfx.lineTo(x + 5, 13);
        gfx.moveTo(x + 3, 13); gfx.lineTo(x + 7, 20);
        gfx.strokePath();
      }

      // Lava glow hotspots on underside (bright spots between cracks)
      for (let x = 28; x < w - 20; x += 52) {
        gfx.fillStyle(0xFF5500, 0.4);
        gfx.fillEllipse(x + 10, H - 3, 18, 5);
        gfx.fillStyle(0xFF9900, 0.5);
        gfx.fillEllipse(x + 10, H - 2, 10, 3);
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
  //  COINS — iridium crystal shards
  // ─────────────────────────────────────────────────────────────────────────────
  private createCoinTextures() {
    const drawCoin = (key: string, glowColor: number, outerColor: number) => {
      const gfx = this.g(20, 20);
      gfx.fillStyle(glowColor, 0.28); gfx.fillCircle(10, 10, 10);
      gfx.fillStyle(outerColor);      gfx.fillCircle(10, 10, 8);
      gfx.fillStyle(0xf4f4f8);        gfx.fillCircle(10, 10, 6);
      gfx.fillStyle(0xffffff);        gfx.fillCircle( 9,  8, 3);
      gfx.fillStyle(0xb0b8cc, 0.8);
      gfx.fillRect(9, 6, 2, 8);
      gfx.generateTexture(key, 20, 20);
      gfx.destroy();
    };
    drawCoin(TEX.COIN,      0xc0d0ff, 0xc4c8d8);  // silver iridium
    drawCoin(TEX.COIN_HIGH, 0xc040ff, 0xd090ff);  // purple (unreachable)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PORTAL — end-of-level dimensional rift
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
  //  COLLECTOR — Baron Cinder's foot-soldier
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
    for (let x = 4; x < 44; x += 8) {
      gfx.fillTriangle(x, 64, x + 4, 58, x + 8, 64);
    }
    gfx.generateTexture(TEX.COLLECTOR, 48, 64);
    gfx.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  GEYSER — base shimmer sprite (32×40)
  // ─────────────────────────────────────────────────────────────────────────────
  private createGeyserTexture() {
    const W = 32, H = 40;
    const gfx = this.g(W, H);

    // Cracked vent opening in the ground
    gfx.fillStyle(0x2A0A00); gfx.fillEllipse(16, 36, 28, 12);
    gfx.fillStyle(0xFF2200, 0.7); gfx.fillEllipse(16, 36, 18, 6);
    gfx.fillStyle(0xFF8800, 0.9); gfx.fillEllipse(16, 36, 10, 4);
    gfx.fillStyle(0xFFCC00, 1.0); gfx.fillEllipse(16, 36, 5, 2);

    // Warning cracks around vent
    gfx.lineStyle(1, 0xFF4400, 0.6);
    gfx.beginPath();
    gfx.moveTo(4, 32);  gfx.lineTo(10, 36);
    gfx.moveTo(28, 31); gfx.lineTo(22, 36);
    gfx.moveTo(14, 28); gfx.lineTo(13, 34);
    gfx.strokePath();

    gfx.generateTexture('geyser-base', W, H);
    gfx.destroy();
  }
}
