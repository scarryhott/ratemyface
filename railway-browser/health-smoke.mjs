#!/usr/bin/env node
// Smoke-test unauthenticated /health without Xvfb or Chrome.
// Usage: PORT=18080 node health-smoke.mjs

import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 18080);
const child = spawn(process.execPath, [path.join(dir, "server.mjs")], {
  cwd: dir,
  env: { ...process.env, PORT: String(port), DISPLAY: ":99" },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
  process.stderr.write(chunk);
});

function stop() {
  if (!child.killed) child.kill("SIGTERM");
}

process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(1);
});

try {
  const deadline = Date.now() + 15000;
  let body;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        body = await res.json();
        break;
      }
    } catch {
      await delay(150);
    }
  }
  if (!body?.ok) {
    throw new Error(`health_not_ready: ${output.slice(-500)}`);
  }
  if (body.browser !== "google-chrome") {
    throw new Error(`unexpected_health_body:${JSON.stringify(body)}`);
  }
  if (!output.includes("[startup] PORT=") || !output.includes("[browser-runtime] server listening on")) {
    throw new Error("missing_startup_logs");
  }
  console.log("health-smoke ok", body);
} finally {
  stop();
  await Promise.race([once(child, "exit"), delay(2000)]);
}
