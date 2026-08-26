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

import { spawn } from "node:child_process"
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

const child = spawn(command, { stdio: "inherit", shell: true })

child.on("exit", (code) => process.exit(code ?? 0))
