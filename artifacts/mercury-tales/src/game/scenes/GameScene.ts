import Phaser from 'phaser';
import { TEX, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, PLAYER_SPEED, PLAYER_JUMP, THIEF_STEAL_PCT } from '../constants';

// ── Player animation constants ────────────────────────────────────────────────
const PLAYER_SCALE = 0.75;  // 85×100 run frame → 64×75 displayed, 45×100 idle → 34×75
type PlayerAnimState = 'idle-r' | 'idle-l' | 'run-r' | 'run-l';

// ── Level layout data ─────────────────────────────────────────────────────────

interface PlatDef { cx: number; cy: number; w: number; high?: true }
interface CoinDef { x: number; y: number; high?: true }
interface EnemyDef { x: number; y: number; left: number; right: number }

// Platform center coords (cx, cy) and width; cy = surface_y + 12
const PLATFORMS: PlatDef[] = [
  // Section 1 — easy intro
  { cx: 280,  cy: 407, w: 160 },
  { cx: 500,  cy: 352, w: 128 },
  { cx: 720,  cy: 302, w: 128 },
  // Over first gap
  { cx: 980,  cy: 437, w: 96  },
  // Section 2
  { cx: 1270, cy: 382, w: 192 },
  { cx: 1530, cy: 332, w: 160 },
  { cx: 1760, cy: 392, w: 128 },
  // Section 3
  { cx: 2090, cy: 352, w: 256 },
  { cx: 2420, cy: 307, w: 192 },
  { cx: 2710, cy: 362, w: 160 },
  // Section 4
  { cx: 3010, cy: 382, w: 256 },
  { cx: 3320, cy: 332, w: 192 },
  { cx: 3570, cy: 392, w: 128 },
  { cx: 3800, cy: 352, w: 192 },
  // Final section
  { cx: 4090, cy: 302, w: 256 },
  { cx: 4420, cy: 357, w: 160 },
  { cx: 4660, cy: 307, w: 192 },
  // Unreachable sky platforms (surface y ≈ 200, player max jump ≈ 290 from ground)
  { cx: 400,  cy: 215, w: 192, high: true },
  { cx: 1430, cy: 195, w: 160, high: true },
  { cx: 2580, cy: 175, w: 192, high: true },
  { cx: 3680, cy: 195, w: 160, high: true },
];

// Ground gaps: missing from x=900 to x=1100 and x=1750 to x=1900
const GROUND_GAPS: [number, number][] = [[900, 1100], [1750, 1900]];

const COINS: CoinDef[] = [
  // Ground coins
  { x:  90, y: 430 }, { x: 150, y: 430 }, { x: 210, y: 430 },
  { x: 420, y: 430 }, { x: 490, y: 430 },
  // P1 (surface 395)
  { x: 250, y: 377 }, { x: 310, y: 377 },
  // P2 (surface 340)
  { x: 475, y: 323 }, { x: 535, y: 323 },
  // P3 (surface 290)
  { x: 720, y: 274 },
  // Bridge
  { x: 980, y: 417 },
  // Section 2
  { x:1240, y: 357 }, { x:1300, y: 357 }, { x:1360, y: 357 },
  { x:1510, y: 307 }, { x:1565, y: 307 },
  { x:1760, y: 367 },
  // Section 3
  { x:2060, y: 327 }, { x:2120, y: 327 },
  { x:2400, y: 282 }, { x:2455, y: 282 },
  { x:2710, y: 337 },
  { x:2980, y: 357 }, { x:3040, y: 357 },
  { x:3295, y: 307 }, { x:3360, y: 307 },
  { x:3570, y: 367 },
  { x:3770, y: 327 }, { x:3835, y: 327 },
  // Final
  { x:4065, y: 277 }, { x:4125, y: 277 },
  { x:4420, y: 332 },
  { x:4635, y: 277 }, { x:4700, y: 277 },
  { x:4820, y: 430 }, { x:4900, y: 430 },
  // HIGH / unreachable coins (purple tint, way up top)
  { x: 350, y: 188, high: true }, { x: 405, y: 188, high: true },
  { x: 455, y: 188, high: true }, { x: 510, y: 188, high: true },
  { x:1380, y: 168, high: true }, { x:1435, y: 168, high: true },
  { x:1490, y: 168, high: true }, { x:1545, y: 168, high: true },
  { x:2525, y: 148, high: true }, { x:2580, y: 148, high: true },
  { x:2635, y: 148, high: true }, { x:2690, y: 148, high: true },
  { x:3625, y: 168, high: true }, { x:3685, y: 168, high: true },
  { x:3740, y: 168, high: true },
];

const ENEMIES: EnemyDef[] = [
  // Ground patrol
  { x:  610, y: 437, left:  450, right:  870 },
  { x: 1600, y: 437, left: 1350, right: 1740 },
  { x: 3200, y: 437, left: 3000, right: 3450 },
  { x: 4500, y: 437, left: 4250, right: 4700 },
  // Platform patrol (y = platform_surface - 11)
  { x: 2100, y: 329, left: 1970, right: 2210 },
  { x: 3325, y: 309, left: 3225, right: 3415 },
  { x: 4095, y: 279, left: 3965, right: 4215 },
];

const END_PORTAL_X = 5050;
const END_PORTAL_Y = 408; // center y (surface y=448, portal height 80, center=408)

// ── Scene ─────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  // physics groups
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private platGroup!:   Phaser.Physics.Arcade.StaticGroup;
  private coinGroup!:   Phaser.Physics.Arcade.StaticGroup;
  private highCoins!:   Phaser.GameObjects.Group;
  private enemyGroup!:  Phaser.Physics.Arcade.Group;

  // player
  private player!:    Phaser.Physics.Arcade.Sprite;
  private cursors!:   Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!:  { up: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

  // game state
  private iridiumCount  = 0;
  private iridiumText!:  Phaser.GameObjects.Text;
  private levelComplete  = false;

  // jump feel
  private coyoteTimer   = 0;
  private jumpBuffer    = 0;
  private isOnGround    = false;
  private wasOnGround   = false;

  // player animation state
  private playerFacing: 'r' | 'l' = 'r';
  private playerAnimState: PlayerAnimState | '' = '';  // '' forces first setPlayerAnimation() to always execute

  // bg parallax
  private bgClouds!: Phaser.GameObjects.TileSprite;
  private bgFar!:    Phaser.GameObjects.TileSprite;
  private bgMid!:    Phaser.GameObjects.TileSprite;
  private bgNear!:   Phaser.GameObjects.TileSprite;
  private lavaGfx!:  Phaser.GameObjects.Graphics;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.levelComplete  = false;
    this.iridiumCount   = 0;
    this.coyoteTimer    = 0;
    this.jumpBuffer     = 0;

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.buildBackground();
    this.buildGround();
    this.buildPlatforms();
    this.buildCoins();
    this.buildEnemies();
    this.buildPlayer();   // must come before buildPortal & setupCollisions
    this.buildPortal();
    this.buildHUD();
    this.setupCamera();
    this.setupControls();
    this.setupCollisions();
    this.setupLavaAnim();

    // Fade in
    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  // ── Build helpers ───────────────────────────────────────────────────────────

  private buildBackground() {
    const { width: W, height: H } = this.scale;

    // ── Layer 0: Sky (fixed, gradient from crimson→gold) ──────────────────
    this.add.image(W / 2, H / 2, TEX.BG_SKY)
      .setScrollFactor(0).setDisplaySize(W, H).setDepth(-5);

    // ── Layer 1: Ember clouds (drift slowly) ──────────────────────────────
    this.bgClouds = this.add.tileSprite(W / 2, 80, W, 100, TEX.BG_CLOUDS)
      .setScrollFactor(0).setOrigin(0.5, 0.5).setDepth(-4);

    // ── Layer 2: Distant colourful volcanic formations (0.08x parallax) ───
    this.bgFar = this.add.tileSprite(W / 2, H - 80, W, 220, TEX.BG_FAR)
      .setScrollFactor(0).setOrigin(0.5, 1).setDepth(-3);

    // ── Layer 3: Mid-distance warm spires (0.18x parallax) ────────────────
    this.bgMid = this.add.tileSprite(W / 2, H - 56, W, 160, TEX.BG_MID)
      .setScrollFactor(0).setOrigin(0.5, 1).setDepth(-2);

    // ── Layer 4: Near ember-grass strip (0.34x parallax) ──────────────────
    this.bgNear = this.add.tileSprite(W / 2, H - 28, W, 60, TEX.BG_NEAR)
      .setScrollFactor(0).setOrigin(0.5, 1).setDepth(-1);

    // Lava graphics (over near strip, below entities)
    this.lavaGfx = this.add.graphics().setDepth(-0.5);
  }

  private buildGround() {
    this.groundGroup = this.physics.add.staticGroup();
    const tileW = 32;

    // Fill ground in segments, skipping gaps
    const segments: [number, number][] = [
      [0, GROUND_GAPS[0][0]],
      [GROUND_GAPS[0][1], GROUND_GAPS[1][0]],
      [GROUND_GAPS[1][1], WORLD_WIDTH],
    ];

    for (const [start, end] of segments) {
      for (let x = start + tileW / 2; x < end; x += tileW) {
        this.groundGroup.create(x, GROUND_Y + 16, TEX.GROUND);
      }
    }
    this.groundGroup.refresh();
  }

  private platTex(w: number): string {
    if (w <= 96)  return TEX.PLAT_S;
    if (w <= 192) return TEX.PLAT_M;
    return TEX.PLAT_L;
  }

  private buildPlatforms() {
    this.platGroup = this.physics.add.staticGroup();

    for (const p of PLATFORMS) {
      if (p.high) {
        // Visual-only — no physics body so the player passes through.
        // These are permanently out of reach for the free character.
        const img = this.add.image(p.cx, p.cy, TEX.PLAT_HIGH);
        img.setDisplaySize(p.w, 24);
        img.setAlpha(0.65);
        continue;
      }
      const spr = this.platGroup.create(p.cx, p.cy, this.platTex(p.w)) as Phaser.Physics.Arcade.Sprite;
      spr.setDisplaySize(p.w, 24);
      (spr.body as Phaser.Physics.Arcade.StaticBody).setSize(p.w, 24);
      spr.refreshBody();
    }
  }

  private buildCoins() {
    this.coinGroup = this.physics.add.staticGroup();
    this.highCoins = this.add.group();

    for (const c of COINS) {
      if (c.high) {
        // Unreachable: not in physics group, just visual
        const img = this.add.image(c.x, c.y, TEX.COIN_HIGH).setScale(0.9).setAlpha(0.85);
        this.highCoins.add(img);
        // Bob up and down
        this.tweens.add({
          targets: img, y: c.y - 5, duration: 700 + Math.random() * 300,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        // Upward arrow indicator
        const arrow = this.add.text(c.x, c.y - 16, '▲', {
          fontSize: '9px', color: '#cc88ff', alpha: 0.7,
        }).setOrigin(0.5);
        this.tweens.add({ targets: arrow, alpha: { from: 0.2, to: 0.8 }, duration: 900, yoyo: true, repeat: -1 });
      } else {
        const img = this.coinGroup.create(c.x, c.y, TEX.COIN) as Phaser.Physics.Arcade.Sprite;
        img.setScale(0.9);
        img.refreshBody();
        // Gentle bob via tween (static body ignores physics y changes, visual only)
        const origY = c.y;
        this.tweens.add({
          targets: img, y: origY - 4, duration: 600 + Math.random() * 200,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private buildEnemies() {
    this.enemyGroup = this.physics.add.group();

    for (const e of ENEMIES) {
      const spr = this.enemyGroup.create(e.x, e.y, TEX.SLUG) as Phaser.Physics.Arcade.Sprite;
      spr.play('cinderslug-walk');
      spr.setScale(1.5);             // 32×32 frame → 48×48 displayed
      spr.setData('left',  e.left);
      spr.setData('right', e.right);
      spr.setData('dir',   1);
      spr.setVelocityX(70);
      spr.setCollideWorldBounds(false);
      const sb = spr.body as Phaser.Physics.Arcade.Body;
      sb.setGravityY(200);
      sb.setSize(26, 26);            // tighter hitbox inside the 48px frame
    }
  }

  private buildPortal() {
    const portal = this.add.image(END_PORTAL_X, END_PORTAL_Y, TEX.PORTAL);
    // Pulsing glow
    this.tweens.add({ targets: portal, alpha: { from: 0.7, to: 1 }, scaleX: { from: 0.95, to: 1.05 }, scaleY: { from: 0.95, to: 1.05 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Portal trigger zone (invisible rectangle)
    const zone = this.add.zone(END_PORTAL_X, END_PORTAL_Y, 60, 80);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => this.triggerLevelEnd(), undefined, this);
  }

  private buildPlayer() {
    // Real animated sprite — origin at foot centre so y === ground level
    this.player = this.physics.add.sprite(80, GROUND_Y, 'player-idle-r');
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    // Warm amber tint: white→golden, blue→brownish-amber for the Scoria palette
    this.player.setTint(0xFFBB60);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setMaxVelocityY(900);
    this.setPlayerAnimation('idle-r');
  }

  /** Switch player animation + update physics body to match new frame width */
  private setPlayerAnimation(state: PlayerAnimState) {
    const key = `ember-${state}`;
    if (this.playerAnimState === state) return;
    this.playerAnimState = state;

    this.player.play(key, true);
    this.player.setScale(PLAYER_SCALE);

    // Physics body in game-pixels (origin is foot-centre, so y = sprite bottom)
    const isRun   = state.startsWith('run');
    const displayW = (isRun ? 85 : 45) * PLAYER_SCALE; // 64 or 34 px
    const displayH = 100 * PLAYER_SCALE;               // 75 px
    const BODY_W = 18, BODY_H = 52;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY_W, BODY_H);
    // offset from sprite top-left (origin is bottom-centre)
    body.setOffset((displayW - BODY_W) / 2, displayH - BODY_H - 4);
  }

  private buildHUD() {
    const { width: W } = this.scale;

    // HUD panel
    const hudBg = this.add.graphics().setScrollFactor(0).setDepth(20);
    hudBg.fillStyle(0x000000, 0.5);
    hudBg.fillRoundedRect(8, 8, 200, 36, 8);

    this.add.image(24, 26, TEX.COIN).setScrollFactor(0).setScale(0.9).setDepth(21);
    this.iridiumText = this.add.text(40, 16, '0  IRIDIUM', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#e8e8e8',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(21);

    // Level label
    this.add.text(W / 2, 16, 'World 1-1   The Char Plains', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#cc7744',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setOrigin(0.5, 0).setDepth(21);

    // (no free-character tip — high coins simply can't be reached)
  }

  private setupCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.12);
    this.cameras.main.setDeadzone(80, 60);
  }

  private setupControls() {
    this.cursors  = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    this.wasdKeys = {
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  private setupCollisions() {
    this.physics.add.collider(this.player, this.groundGroup);
    this.physics.add.collider(this.player, this.platGroup);
    this.physics.add.collider(this.enemyGroup, this.groundGroup);
    this.physics.add.collider(this.enemyGroup, this.platGroup);

    // Collect coins
    this.physics.add.overlap(this.player, this.coinGroup, (_, coin) => {
      this.collectCoin(coin as Phaser.Physics.Arcade.Sprite);
    }, undefined, this);

    // Stomp or get hit by enemy
    this.physics.add.overlap(this.player, this.enemyGroup, (_, enemy) => {
      this.handleEnemyContact(enemy as Phaser.Physics.Arcade.Sprite);
    }, undefined, this);
  }

  private setupLavaAnim() {
    let phase = 0;
    this.time.addEvent({ delay: 20, loop: true, callback: () => {
      phase += 0.05;
      this.lavaGfx.clear();

      // ── Lava river below ground (vivid orange-red) ──────────────────────
      this.lavaGfx.fillStyle(0xFF3300, 1.0);
      this.lavaGfx.fillRect(0, GROUND_Y + 32, WORLD_WIDTH, 60);

      // Bright surface wave (animated sine strip)
      this.lavaGfx.fillStyle(0xFF6600, 1.0);
      this.lavaGfx.fillRect(0, GROUND_Y + 32, WORLD_WIDTH, 8);

      // Golden surface shimmer
      this.lavaGfx.fillStyle(0xFFCC00, 0.5 + Math.sin(phase * 0.8) * 0.25);
      this.lavaGfx.fillRect(0, GROUND_Y + 32, WORLD_WIDTH, 3);

      // ── Lava pools in the ground gaps ───────────────────────────────────
      for (const [gStart, gEnd] of GROUND_GAPS) {
        // Deep lava base
        this.lavaGfx.fillStyle(0xFF2200, 1.0);
        this.lavaGfx.fillRect(gStart, GROUND_Y - 24, gEnd - gStart, 60);
        // Bright surface
        this.lavaGfx.fillStyle(0xFF6600, 1.0);
        this.lavaGfx.fillRect(gStart, GROUND_Y - 24, gEnd - gStart, 6);
        // Golden hotspot glow
        this.lavaGfx.fillStyle(0xFFCC00, 0.4 + Math.sin(phase * 1.2) * 0.2);
        this.lavaGfx.fillRect(gStart, GROUND_Y - 22, gEnd - gStart, 10);
      }

      // ── Large bubbling hotspots ──────────────────────────────────────────
      for (let x = 60; x < WORLD_WIDTH; x += 180) {
        const bSize = 7 + Math.sin(phase + x * 0.025) * 5;
        this.lavaGfx.fillStyle(0xFF8800, 0.75);
        this.lavaGfx.fillCircle(x, GROUND_Y + 38, bSize);
        this.lavaGfx.fillStyle(0xFFDD00, 0.5);
        this.lavaGfx.fillCircle(x, GROUND_Y + 38, bSize * 0.45);
      }

      // ── Gap hotspots ─────────────────────────────────────────────────────
      for (const [gStart, gEnd] of GROUND_GAPS) {
        const cx = (gStart + gEnd) / 2;
        const gR = 14 + Math.sin(phase * 1.3) * 8;
        this.lavaGfx.fillStyle(0xFFCC00, 0.5);
        this.lavaGfx.fillCircle(cx, GROUND_Y - 10, gR);
        this.lavaGfx.fillStyle(0xFFFF80, 0.6);
        this.lavaGfx.fillCircle(cx, GROUND_Y - 10, gR * 0.5);
      }
    }});
  }

  // ── Game logic ──────────────────────────────────────────────────────────────

  private collectCoin(coin: Phaser.Physics.Arcade.Sprite) {
    if (!coin.active) return;
    coin.setActive(false).setVisible(false);
    (coin.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.iridiumCount++;
    this.iridiumText.setText(`${this.iridiumCount}  IRIDIUM`);

    // Floating +1 text
    const pop = this.add.text(coin.x, coin.y - 10, '+1', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#e8e8e8',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: pop, y: coin.y - 42, alpha: 0, duration: 550, onComplete: () => pop.destroy() });

    // Sparkle burst using tweened circles
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const dot = this.add.circle(coin.x, coin.y, 3, 0xd0d0f0).setDepth(29);
      this.tweens.add({
        targets: dot,
        x: coin.x + Math.cos(angle) * 28,
        y: coin.y + Math.sin(angle) * 28,
        alpha: 0, duration: 350,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private handleEnemyContact(enemy: Phaser.Physics.Arcade.Sprite) {
    if (!enemy.active) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;

    // Stomp — player is falling and above the enemy's center
    if (body.velocity.y > 0 && this.player.y < enemy.y - 4) {
      // Kill enemy
      enemy.setActive(false).setVisible(false);
      enemyBody.enable = false;
      // Bounce player up
      body.setVelocityY(-350);
      // Pop effect
      const pop = this.add.text(enemy.x, enemy.y - 10, 'STOMP!', {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#ffcc44',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(30);
      this.tweens.add({ targets: pop, y: enemy.y - 45, alpha: 0, duration: 600, onComplete: () => pop.destroy() });
      this.cameras.main.shake(100, 0.004);
    } else {
      // Side hit — knockback if not invincible
      if (this.player.getData('invincible')) return;
      this.player.setData('invincible', true);
      const dir = this.player.x < enemy.x ? -1 : 1;
      body.setVelocity(dir * 280, -320);
      // Flash player
      this.tweens.add({
        targets: this.player, alpha: 0.2, duration: 100,
        yoyo: true, repeat: 9,
        onComplete: () => {
          this.player.setAlpha(1);
          this.player.setData('invincible', false);
        },
      });
      this.cameras.main.shake(150, 0.006);
    }
  }

  private triggerLevelEnd() {
    if (this.levelComplete) return;
    this.levelComplete = true;

    // Stop player
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;

    // Camera zoom in on portal
    this.cameras.main.pan(END_PORTAL_X, END_PORTAL_Y, 600, 'Power2');
    this.cameras.main.zoomTo(1.4, 800);

    this.time.delayedCall(1000, () => {
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LevelEndScene', { iridiumEarned: this.iridiumCount });
      });
    });
  }

  // ── Update loop ─────────────────────────────────────────────────────────────

  update(time: number, delta: number) {
    if (this.levelComplete) return;

    const dt     = delta / 1000;
    const body   = this.player.body as Phaser.Physics.Arcade.Body;
    this.isOnGround = body.blocked.down;

    // Coyote time
    if (this.isOnGround) { this.coyoteTimer = 0.08; }
    else if (this.coyoteTimer > 0) { this.coyoteTimer -= dt; }

    // Jump buffer
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                        Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
                        Phaser.Input.Keyboard.JustDown(this.wasdKeys.up);
    if (jumpPressed) this.jumpBuffer = 0.10;
    else if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

    // Execute jump
    if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
      body.setVelocityY(PLAYER_JUMP);
      this.jumpBuffer  = 0;
      this.coyoteTimer = 0;
    }

    // Variable jump height — release early = smaller jump
    const jumpHeld = this.cursors.up.isDown || this.cursors.space.isDown || this.wasdKeys.up.isDown;
    if (!jumpHeld && body.velocity.y < -200) {
      body.setVelocityY(body.velocity.y * (1 - dt * 8));
    }

    // Horizontal movement
    const goLeft  = this.cursors.left.isDown  || this.wasdKeys.left.isDown;
    const goRight = this.cursors.right.isDown || this.wasdKeys.right.isDown;

    if (goLeft) {
      body.setVelocityX(-PLAYER_SPEED);
      this.playerFacing = 'l';
      this.setPlayerAnimation('run-l');
    } else if (goRight) {
      body.setVelocityX(PLAYER_SPEED);
      this.playerFacing = 'r';
      this.setPlayerAnimation('run-r');
    } else {
      // Instant stop on ground, slight drift in air
      body.setVelocityX(this.isOnGround ? 0 : body.velocity.x * (1 - dt * 14));
      // Idle on ground, continue run-stride pose in the air
      this.setPlayerAnimation(this.isOnGround
        ? (`idle-${this.playerFacing}` as PlayerAnimState)
        : (`run-${this.playerFacing}` as PlayerAnimState));
    }

    // Kill player who falls into lava
    if (this.player.y > WORLD_HEIGHT + 60) {
      this.player.setPosition(80, GROUND_Y);  // origin at foot-centre
      body.setVelocity(0, 0);
      this.iridiumCount = Math.max(0, this.iridiumCount - 3);
      this.iridiumText.setText(`${this.iridiumCount}  IRIDIUM`);
    }

    // Enemy patrol AI
    this.enemyGroup.getChildren().forEach((obj) => {
      const slug = obj as Phaser.Physics.Arcade.Sprite;
      if (!slug.active) return;
      const sb = slug.body as Phaser.Physics.Arcade.Body;
      const left  = slug.getData('left')  as number;
      const right = slug.getData('right') as number;
      const dir   = slug.getData('dir')   as number;

      if (slug.x <= left && dir === -1) {
        slug.setData('dir', 1);
        sb.setVelocityX(70);
        slug.setFlipX(false);
      } else if (slug.x >= right && dir === 1) {
        slug.setData('dir', -1);
        sb.setVelocityX(-70);
        slug.setFlipX(true);
      }
    });

    // Parallax scroll (4 layers for depth)
    this.bgClouds.tilePositionX = this.cameras.main.scrollX * 0.04;
    this.bgFar.tilePositionX    = this.cameras.main.scrollX * 0.10;
    this.bgMid.tilePositionX    = this.cameras.main.scrollX * 0.20;
    this.bgNear.tilePositionX   = this.cameras.main.scrollX * 0.38;

    this.wasOnGround = this.isOnGround;
  }
}
