export const WORLD_WIDTH   = 5600;
export const WORLD_HEIGHT  = 480;
export const GROUND_Y      = 448;   // surface of the ground (top of ground tiles)
export const PLAYER_SPEED  = 210;
export const PLAYER_JUMP   = -415;   // max height ~95px; high platforms at Δy≥140 are unreachable
export const THIEF_STEAL_PCT = 0.45;

// Textures
export const TEX = {
  PLAYER:       'player',
  GROUND:       'ground-tile',
  PLAT_S:       'plat-s',   //  96 x 24
  PLAT_M:       'plat-m',   // 192 x 24
  PLAT_L:       'plat-l',   // 288 x 24
  PLAT_HIGH:    'plat-high',
  COIN:         'coin',
  COIN_HIGH:    'coin-high',
  SLUG:         'cinderslug',
  PORTAL:       'portal',
  COLLECTOR:    'char-collector',
  BG_SKY:       'bg-sky',
  BG_FAR:       'bg-far',
  BG_NEAR:      'bg-near',
} as const;
