import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskRewardEmbr,
  liquidityRewardEmbr,
  AIRDROP_POOL_TOTAL,
  AIRDROP_DAILY_CAP,
} from "./airdrop-config.ts";

test("airdrop pool constants", () => {
  assert.equal(AIRDROP_POOL_TOTAL, 100_000);
  assert.equal(AIRDROP_DAILY_CAP, 500);
});

test("task reward scaling", () => {
  assert.equal(taskRewardEmbr(8), 5);
  assert.equal(taskRewardEmbr(20), 2.5);
  assert.equal(taskRewardEmbr(2, 2), 10);
});

test("liquidity reward decay", () => {
  assert.equal(liquidityRewardEmbr(0), 500);
  assert.equal(liquidityRewardEmbr(1), 495);
});
