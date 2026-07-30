#!/usr/bin/env node
/**
 * Generates app icons from icon.svg using sharp (if available) or
 * writes placeholder PNG files for development builds.
 *
 * Run: node resources/generate-icons.js
 * Requires: npm install sharp  (optional — falls back to placeholder)
 */
const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const iconsDir = path.join(__dirname, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

// Minimal 1x1 transparent PNG (placeholder)
const PLACEHOLDER_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
  "0000000a49444154789c6260000000000200e221bc330000000049454e44ae426082",
  "hex"
);

try {
  const sharp = require("sharp");
  const svgPath = path.join(__dirname, "icon.svg");
  const svg = fs.readFileSync(svgPath);
  for (const size of sizes) {
    sharp(svg).resize(size, size).png().toFile(path.join(iconsDir, `${size}x${size}.png`), (err) => {
      if (err) console.error(`  Failed ${size}x${size}:`, err.message);
      else console.log(`  ✓ ${size}x${size}.png`);
    });
  }
  sharp(svg).resize(256, 256).png().toFile(path.join(__dirname, "icon.png"));
  console.log("Icons generated with sharp.");
} catch {
  console.log("sharp not installed — writing placeholder PNGs for development.");
  for (const size of sizes) {
    fs.writeFileSync(path.join(iconsDir, `${size}x${size}.png`), PLACEHOLDER_PNG);
  }
  fs.writeFileSync(path.join(__dirname, "icon.png"), PLACEHOLDER_PNG);
  fs.writeFileSync(path.join(__dirname, "tray-icon.png"), PLACEHOLDER_PNG);
  console.log("Placeholder icons written. Install sharp and re-run for real icons:");
  console.log("  npm install sharp && node resources/generate-icons.js");
}
