import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const checks = [
  ["package.json", "package.json"],
  ["Supabase directory", "supabase"],
  ["Production docs", "docs/production"],
];

let failed = false;

console.log("\n=== AIWAKU DB AUDIT ===\n");

for (const [name, relativePath] of checks) {
  const target = path.join(root, relativePath);
  const exists = fs.existsSync(target);

  console.log(`${exists ? "OK" : "MISSING"}  ${name}: ${relativePath}`);

  if (!exists) failed = true;
}

const productionDir = path.join(root, "docs/production");

if (fs.existsSync(productionDir)) {
  const files = fs.readdirSync(productionDir)
    .filter((f) => f.toLowerCase().endsWith(".sql"));

  console.log(`\nSQL files found: ${files.length}`);

  for (const file of files) {
    console.log(`  - ${file}`);
  }
}

console.log("\n=== RESULT ===");

if (failed) {
  console.log("AUDIT FAILED");
  process.exitCode = 1;
} else {
  console.log("AUDIT OK");
}
