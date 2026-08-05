/**
 * Token launch operator routes — manual escrow setup for Monero/custom chains.
 * Protected by x-admin-secret (CHAIN_NODE_INTERNAL_SECRET).
 */

import { Router } from "express";
import {
  getAllLaunches,
  getLaunchesAwaitingEscrow,
  getLaunch,
  updateLaunchFields,
  type TokenLaunch,
} from "../lib/launch-db";
import { logger } from "../lib/logger";

const router = Router();

function adminSecret(): string {
  return process.env["CHAIN_NODE_INTERNAL_SECRET"] ?? process.env["SESSION_SECRET"] ?? "";
}

function isAdmin(req: { headers: Record<string, unknown> }): boolean {
  const secret = adminSecret();
  const auth = req.headers["x-admin-secret"];
  return Boolean(secret && typeof auth === "string" && auth === secret);
}

function sanitizeLaunch(launch: TokenLaunch): Omit<TokenLaunch, "bridge_private_key_encrypted"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { bridge_private_key_encrypted: _secret, ...safe } = launch;
  return safe;
}

// GET /token-launch/admin/queue
router.get("/token-launch/admin/queue", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const [all, awaiting] = await Promise.all([
      getAllLaunches(200),
      getLaunchesAwaitingEscrow(),
    ]);

    res.json({
      awaiting_escrow: awaiting.map(sanitizeLaunch),
      recent: all.map(sanitizeLaunch),
      counts: {
        awaiting_escrow: awaiting.length,
        live: all.filter((l) => l.status === "live").length,
        failed: all.filter((l) => l.status === "failed").length,
        in_progress: all.filter((l) =>
          ["pending_payment", "payment_confirmed", "deploying", "pending_gas"].includes(l.status),
        ).length,
      },
    });
  } catch (err) {
    logger.error({ err }, "[launch-admin] queue error");
    res.status(500).json({ error: "Failed to load launch queue" });
  }
});

// PATCH /token-launch/admin/:id/escrow
router.patch("/token-launch/admin/:id/escrow", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const launch = await getLaunch(req.params.id);
    if (!launch) return res.status(404).json({ error: "Launch not found" });

    const {
      bridge_wallet_address,
      native_bridge_address,
      admin_notes,
      operator_message,
      mark_live,
    } = req.body as {
      bridge_wallet_address?: string;
      native_bridge_address?: string;
      admin_notes?: string;
      operator_message?: string;
      mark_live?: boolean;
    };

    if (!bridge_wallet_address?.trim()) {
      return res.status(400).json({ error: "bridge_wallet_address required" });
    }

    const escrow = bridge_wallet_address.trim();
    const native = (native_bridge_address ?? escrow).trim();
    const goLive = mark_live !== false;

    if (goLive && launch.status !== "awaiting_escrow" && launch.status !== "live") {
      return res.status(422).json({
        error: `Cannot mark live from status ${launch.status} — wTOKEN deploy may still be in progress`,
      });
    }

    if (!launch.wrapped_token_address) {
      return res.status(422).json({ error: "Wrapped token not deployed yet — wait for deploying to finish" });
    }

    await updateLaunchFields(launch.id, {
      bridge_wallet_address: escrow,
      native_bridge_address: native,
      bridge_wallet_type: "manual",
      admin_notes: admin_notes?.trim() || launch.admin_notes,
      operator_message:
        operator_message?.trim() ||
        "Bridge escrow is ready — send native coin to the deposit address on the Bridge page.",
      status: goLive ? "live" : launch.status,
    });

    const updated = await getLaunch(launch.id);
    logger.info({ id: launch.id, escrow, goLive }, "[launch-admin] escrow configured");

    res.json({ ok: true, launch: updated ? sanitizeLaunch(updated) : null });
  } catch (err) {
    logger.error({ err }, "[launch-admin] escrow patch error");
    res.status(500).json({ error: "Failed to update escrow" });
  }
});

export default router;
