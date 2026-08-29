#!/usr/bin/env node
/**
 * `pnpm dev` — bring the dev stack up, whatever is already up.
 *
 * The ask is "get my environment running", not "run exactly two processes".
 * So when half of it is already running, this starts the other half and says
 * so, rather than refusing over a port it was never going to need. Refusing
 * only moved the work to the reader: they had to notice which half was
 * missing and type a different command.
 *
 * The per-server scripts stay strict on purpose. `pnpm dev:api` names one
 * server, so a busy port there is a genuine conflict and dev-preflight.mjs
 * says so.
 */

import { spawn, spawnSync } from "node:child_process"
import net from "node:net"

const SERVERS = [
  { name: "web", port: 3000, script: "dev:web" },
  { name: "api", port: 4000, script: "dev:api" }
]

function canBind(port, host) {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
    if (host) probe.listen(port, host)
    else probe.listen(port)
  })
}

/** Free both ways round — see dev-preflight.mjs for why loopback matters. */
async function isFree(port) {
  return (await canBind(port)) && (await canBind(port, "127.0.0.1"))
}

const missing = []
const running = []
for (const server of SERVERS) {
  ;((await isFree(server.port)) ? missing : running).push(server)
}

for (const server of running) {
  console.log(`✓ ${server.name} (${server.port}) is already running`)
}

if (missing.length === 0) {
  console.log("\nThe whole dev stack is up — nothing to start.\n")
  // Success: what was asked for is true. Failing here would only make a
  // second `pnpm dev` look broken when it is merely unnecessary.
  process.exit(0)
}

for (const server of missing) {
  console.log(`▶ starting ${server.name} (${server.port})`)
}
console.log("")

// One command string, quoted here rather than an argv array: with a shell in
// the middle the array is concatenated, not escaped, and `pnpm dev:web`
// arrives as two arguments — which is exactly how this first went wrong.
//
// concurrently prefixes each line with the server's own name, so a mixed
// stack reads as [web]/[api] rather than [0]/[1] — worth having now that
// which processes are running varies from run to run.
const command = [
  "pnpm exec concurrently",
  `--names ${missing.map((s) => s.name).join(",")}`,
  ...missing.map((s) => `"pnpm ${s.script}"`)
].join(" ")

const child = spawn(command, {
  stdio: "inherit",
  shell: true,
  // POSIX only: makes the child its own process-group leader so `kill(-pid)`
  // below reaches every descendant. It also takes the group out of the
  // terminal's foreground, which is the point — Ctrl+C then arrives here
  // and nowhere else, and this process decides what dies.
  detached: process.platform !== "win32"
})

/**
 * Kill the whole subtree, not just the process this script can see.
 *
 * Interrupting `pnpm dev` used to leave next and nest alive: between here and
 * them sit a cmd.exe wrapper, two pnpm shims and concurrently, and the ones
 * that take the interrupt exit without passing it down. What is left is a
 * server nobody is watching that still holds 3000 or 4000 — so the next
 * `pnpm dev` sees the port busy, starts only the other half, and the stack
 * quietly doubles up. That is the whole orphan problem, at its source.
 *
 * `shell: true` means child.pid belongs to the shell rather than to pnpm, so
 * on Windows only `/T` covers what actually needs to die.
 */
function killTree() {
  // Already gone: the pid may since have been handed to something else, and
  // taskkill does not care whose it is now.
  if (!child.pid || child.exitCode !== null || child.signalCode) return

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore"
    })
  } else {
    // Negative pid = the group created by `detached` above.
    try {
      process.kill(-child.pid, "SIGTERM")
    } catch {
      // Raced us to it — nothing left to signal.
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    killTree()
    // 0, not 130: the run ended because it was asked to. A non-zero code here
    // only makes pnpm print ELIFECYCLE over the top of a clean shutdown.
    process.exit(0)
  })
}

// Last resort — an uncaught throw or an explicit exit elsewhere still cleans up.
process.on("exit", killTree)

child.on("exit", (code) => process.exit(code ?? 0))
