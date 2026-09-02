import { test } from "node:test";
import assert from "node:assert/strict";
import { taskRewardEmbr, liquidityRewardEmbr } from "./rewards.ts";

test("task reward tiers", () => {
  assert.equal(taskRewardEmbr(5), 5);
  assert.equal(taskRewardEmbr(15), 2.5);
  assert.equal(taskRewardEmbr(300), 0.15625);
});

test("liquidity decay", () => {
  assert.equal(liquidityRewardEmbr(0), 500);
  assert.equal(liquidityRewardEmbr(1), 495);
});
