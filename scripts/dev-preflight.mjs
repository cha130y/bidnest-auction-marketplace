#!/usr/bin/env node
/**
 * Preflight for `pnpm dev` — refuse to start on top of a server that is
 * already running.
 *
 * Nothing else stops a second `pnpm dev`: each terminal is on its own, and
 * the only guard is the port itself, which "guards" by letting NestJS crash
 * with a twenty-line EADDRINUSE stack trace while Next silently hops to
 * 3001 — half the stack dies and the other half hides. This says what is
 * actually going on, in one sentence, before either half starts.
 *
 * The check binds the port the same way the servers will (dual-stack, host
 * unset), so it cannot disagree with them about what "in use" means.
 */

import net from "node:net"
import { execSync } from "node:child_process"

const ports = process.argv.slice(2).map(Number).filter(Boolean)
if (ports.length === 0) {
  console.error("usage: dev-preflight.mjs <port> [port...]")
  process.exit(2)
}

/** Resolves true when the port is free — tested by binding it, briefly. */
function isFree(port) {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
    probe.listen(port)
  })
}

/** Best-effort: who is on the port. Empty string when we cannot tell. */
function ownerOf(port) {
  try {
    if (process.platform === "win32") {
      const rows = execSync(`netstat -ano`, { encoding: "utf8" })
        .split(/\r?\n/)
        .filter((l) => l.includes(`:${port} `) && l.includes("LISTENING"))
      const pid = rows[0]?.trim().split(/\s+/).at(-1)
      if (!pid) return ""
      const task = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: "utf8"
      })
      const name = task.split(",")[0]?.replaceAll('"', "").trim()
      return `PID ${pid}${name ? ` — ${name}` : ""}`
    }
    const pid = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8"
    })
      .trim()
      .split("\n")[0]
    return pid ? `PID ${pid}` : ""
  } catch {
    return ""
  }
}

const busy = []
for (const port of ports) {
  if (!(await isFree(port))) busy.push(port)
}

if (busy.length === 0) process.exit(0)

console.error("")
for (const port of busy) {
  const owner = ownerOf(port)
  console.error(
    `⛔ port ${port} is already in use${owner ? ` (${owner})` : ""}`
  )
}
console.error(`
   A dev server is probably already running — maybe in another terminal.

   Either keep using the one that is up (nothing more to start), or stop
   it first:${
     process.platform === "win32"
       ? `\n     taskkill /PID <pid> /F`
       : `\n     kill <pid>`
   }
`)
process.exit(1)
