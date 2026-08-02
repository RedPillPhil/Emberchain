import { Router } from "express";

const router = Router();

router.get("/healthz", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify({ status: "ok", service: "chain-node" }));
});

export default router;
