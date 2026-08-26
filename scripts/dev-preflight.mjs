#!/usr/bin/env node
/**
 * Preflight for `pnpm dev` — refuse to start on top of a server that is
 * already running, and say what to do instead.
 *
 * Nothing else stops a second `pnpm dev`: each terminal is on its own, and
 * the only guard is the port itself, which "guards" by letting NestJS crash
 * with a twenty-line EADDRINUSE stack trace while Next silently hops to
 * 3001 — half the stack dies and the other half hides.
 *
 * Half-running is the common case, not the exception: one server survives a
 * crash, or gets started alone, and `pnpm dev` then refuses over the port it
 * cannot have. Saying only "something is running" leaves the reader to work
 * out that the other half is what they wanted. So each port carries the name
 * of the script that starts it, and the message names that script.
 *
 * Usage: dev-preflight.mjs web:3000 api:4000
 */

import net from "node:net"
import { execSync } from "node:child_process"

const targets = process.argv.slice(2).map((arg) => {
  const [name, port] = arg.includes(":") ? arg.split(":") : [null, arg]
  return { name, port: Number(port) }
})

if (targets.length === 0 || targets.some((t) => !t.port)) {
  console.error("usage: dev-preflight.mjs [name:]<port> [[name:]<port>...]")
  process.exit(2)
}

/** Can we bind this exact host and port? */
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

/**
 * Free means free both ways round.
 *
 * The dev servers bind every interface, so the wildcard bind is the one that
 * matches how they will fail. But a service bound only to loopback — Docker
 * publishes Postgres as 127.0.0.1:5433 — leaves the wildcard bind succeeding
 * on Windows, and the port would be reported free while plainly in use. Try
 * both and let either answer settle it.
 */
async function isFree(port) {
  return (await canBind(port)) && (await canBind(port, "127.0.0.1"))
}

/** Best-effort: who is on the port. Empty string when we cannot tell. */
function ownerOf(port) {
  try {
    if (process.platform === "win32") {
      const row = execSync("netstat -ano", { encoding: "utf8" })
        .split(/\r?\n/)
        .find((l) => l.includes(`:${port} `) && l.includes("LISTENING"))
      const pid = row?.trim().split(/\s+/).at(-1)
      if (!pid) return { pid: "", label: "" }
      const task = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: "utf8"
      })
      const name = task.split(",")[0]?.replaceAll('"', "").trim()
      return { pid, label: `PID ${pid}${name ? ` — ${name}` : ""}` }
    }
    const pid = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8"
    })
      .trim()
      .split("\n")[0]
    return { pid, label: pid ? `PID ${pid}` : "" }
  } catch {
    return { pid: "", label: "" }
  }
}

const busy = []
const free = []
for (const target of targets) {
  ;((await isFree(target.port)) ? free : busy).push(target)
}

if (busy.length === 0) process.exit(0)

const describe = (t) => (t.name ? `${t.name} (${t.port})` : `port ${t.port}`)
const kill = (pid) =>
  process.platform === "win32"
    ? `taskkill /PID ${pid || "<pid>"} /F`
    : `kill ${pid || "<pid>"}`

console.error("")
for (const target of busy) {
  const { label } = ownerOf(target.port)
  console.error(
    `⛔ ${describe(target)} is already running${label ? `  (${label})` : ""}`
  )
}

// The half that is missing is usually what the reader actually wanted, so
// name the script that starts exactly that and nothing else.
const startable = free.filter((t) => t.name)
if (startable.length > 0) {
  console.error(`
   ${free.map(describe).join(" and ")} ${free.length > 1 ? "are" : "is"} free — to start just that:
${startable.map((t) => `     pnpm dev:${t.name}`).join("\n")}
`)
} else {
  console.error(`
   Everything this command starts is already up, so there is nothing to do.
`)
}

const firstPid = ownerOf(busy[0].port).pid
console.error(`   To restart instead, stop the running one first:
     ${kill(firstPid)}
`)

process.exit(1)
