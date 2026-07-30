/**
 * Programmatic API for embedding the Emberchain daemon inside Electron
 * (or any other host process).
 *
 * Usage:
 *   import { startEmbeddedDaemon } from "@workspace/ember-daemon";
 *   const handle = await startEmbeddedDaemon({ dataDir, port: 8545, seedPeers: [...] });
 *   // ...
 *   await handle.stop();
 */

import { daemonConfig } from "./lib/config.js";
import { startServer } from "./server.js";
import { chain } from "./lib/chain.js";
import { getPeers, addPeer } from "./lib/peers.js";
import { isChainSynced, getBestPeerHeight, configureSyncLoop } from "./lib/sync-loop.js";
import type { ServerHandle } from "./server.js";

export interface EmbeddedDaemonConfig {
  /** Directory where chain.db and chain.json are stored. */
  dataDir: string;
  /** HTTP port (default 8545). */
  port?: number;
  /** Bootstrap peers. */
  seedPeers?: string[];
  /** Public URL of this node (for peer announcements). Leave empty for home nodes. */
  nodeUrl?: string;
  /** Use home-connection mode: smaller batches, sequential PEX, no snapshot download. */
  gentleSync?: boolean;
  /** Log level. */
  logLevel?: string;
}

export interface NodeStatus {
  running: boolean;
  blockHeight: number;
  difficulty: string;
  peers: number;
  isSynced: boolean;
  bestPeerHeight: number;
}

export interface MiningStatus {
  mining: boolean;
  minerAddress: string | null;
  hashRate: number;
  activeMiners: number;
  sharesInRound: number;
  blocksMined: number;
}

export interface DaemonHandle {
  /** Port the daemon is listening on. */
  readonly port: number;
  /** Data directory. */
  readonly dataDir: string;
  /** Stop the daemon and flush the database. */
  stop(): Promise<void>;
  /** Current node status (block height, peers, sync). */
  getStatus(): Promise<NodeStatus>;
  /** Current mining status. */
  getMiningStatus(): MiningStatus;
  /** Start server-side mining. */
  startMining(minerAddress: string, intensity?: number): Promise<void>;
  /** Stop server-side mining. */
  stopMining(): Promise<void>;
  /** Connected peer URLs. */
  getPeers(): string[];
  /** Manually add a peer. */
  addPeer(url: string): void;
}

let _handle: (ServerHandle & { daemonConfig: typeof daemonConfig }) | null = null;

export async function startEmbeddedDaemon(cfg: EmbeddedDaemonConfig): Promise<DaemonHandle> {
  if (_handle) throw new Error("Daemon is already running");

  // Apply config to the shared config singleton BEFORE any module reads it.
  // (Modules are already imported at this point, but daemonConfig is mutable.)
  daemonConfig.dataDir = cfg.dataDir;
  process.env.EMBER_DATA_DIR = cfg.dataDir;

  if (cfg.port)      { daemonConfig.port    = cfg.port; }
  if (cfg.nodeUrl)   { daemonConfig.nodeUrl = cfg.nodeUrl.replace(/\/$/, ""); process.env.NODE_URL = daemonConfig.nodeUrl; }
  if (cfg.logLevel)  { daemonConfig.logLevel = cfg.logLevel; }
  if (cfg.seedPeers) { daemonConfig.seedPeers = cfg.seedPeers; process.env.SEED_PEERS = cfg.seedPeers.join(","); }

  if (cfg.gentleSync) {
    configureSyncLoop({ batchSize: 500, batchDelayMs: 5_000, skipSnapshot: true, gentlePex: true, idleIntervalMs: 30_000 });
  }

  const server = await startServer(daemonConfig.port);
  _handle = { ...server, daemonConfig };

  return {
    port: daemonConfig.port,
    dataDir: cfg.dataDir,

    stop: async () => {
      await server.stop();
      _handle = null;
    },

    getStatus: async (): Promise<NodeStatus> => {
      try {
        const s = await chain.getStatus();
        return {
          running: true,
          blockHeight: s.height,
          difficulty: s.difficulty,
          peers: getPeers().length,
          isSynced: isChainSynced(),
          bestPeerHeight: getBestPeerHeight(),
        };
      } catch {
        return { running: false, blockHeight: 0, difficulty: "0", peers: 0, isSynced: false, bestPeerHeight: 0 };
      }
    },

    getMiningStatus: (): MiningStatus => {
      try {
        const s = chain.getMiningStatus() as {
          mining?: boolean; minerAddress?: string | null;
          hashRate?: number; activeMiners?: number;
          sharesInRound?: number; blocksMined?: number;
        };
        return {
          mining: s.mining ?? false,
          minerAddress: s.minerAddress ?? null,
          hashRate: s.hashRate ?? 0,
          activeMiners: s.activeMiners ?? 0,
          sharesInRound: s.sharesInRound ?? 0,
          blocksMined: s.blocksMined ?? 0,
        };
      } catch {
        return { mining: false, minerAddress: null, hashRate: 0, activeMiners: 0, sharesInRound: 0, blocksMined: 0 };
      }
    },

    startMining: async (minerAddress: string, intensity = 2) => {
      await chain.startMining(minerAddress, intensity);
    },

    stopMining: async () => {
      await chain.stopMining();
    },

    getPeers: () => getPeers(),
    addPeer: (url: string) => addPeer(url),
  };
}

/** Returns true if the daemon is currently running. */
export function isDaemonRunning(): boolean { return _handle !== null; }
