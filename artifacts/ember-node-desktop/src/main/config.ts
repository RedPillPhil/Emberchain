/**
 * Persists user configuration to disk (data-dir/config.json).
 * The config file is written whenever settings change from the Settings screen.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface AppConfig {
  /** Port the RPC server binds to. */
  port: number;
  /** Whether to start mining immediately on launch. */
  autoMine: boolean;
  /** Address that receives block rewards. */
  minerAddress: string;
  /** Mining intensity 1–10. */
  miningIntensity: number;
  /** Use gentle/home-connection sync mode. */
  gentleSync: boolean;
  /** Custom seed peers (comma-separated). */
  customPeers: string;
  /** Whether to start the daemon automatically when the app opens. */
  autoStart: boolean;
  /** Minimize to system tray on close. */
  minimizeToTray: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  port: 8545,
  autoMine: false,
  minerAddress: "",
  miningIntensity: 2,
  gentleSync: true,
  customPeers: "",
  autoStart: true,
  minimizeToTray: true,
};

export function loadConfig(dataDir: string): AppConfig {
  const configPath = join(dataDir, "config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(dataDir: string, config: AppConfig): void {
  mkdirSync(dataDir, { recursive: true });
  const configPath = join(dataDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
