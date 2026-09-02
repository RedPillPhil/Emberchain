import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReferrer, DEFAULT_REFERRER } from "./referrer.ts";

test("resolveReferrer uses default when ref missing", () => {
  assert.equal(resolveReferrer(null), DEFAULT_REFERRER);
});

test("resolveReferrer rejects self-referral", () => {
  const w = "0x1111111111111111111111111111111111111111";
  assert.equal(
    resolveReferrer(w, w),
    "0x0000000000000000000000000000000000000000",
  );
});
