/**
 * Production starter for `output: "standalone"` builds.
 * Copies static assets / public / data into `.next/standalone`, then boots server.js.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

if (!fs.existsSync(serverJs)) {
  console.error("Missing .next/standalone/server.js — run `npm run build` first.");
  process.exit(1);
}

copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyDir(path.join(root, "data"), path.join(standalone, "data"));

process.env.PORT = process.env.PORT || "3000";
// Linux often sets HOSTNAME to the machine name; Next uses it as the listen host.
// Prefer explicit BIND_HOST, otherwise always bind all interfaces for deploy.
process.env.HOSTNAME = process.env.BIND_HOST || "0.0.0.0";
process.env.NODE_ENV = "production";

const child = spawn(process.execPath, [serverJs], {
  cwd: standalone,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
