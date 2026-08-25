#!/usr/bin/env node
/**
 * `pnpm check:setup` — why sign-in does not work on a fresh clone.
 *
 * Every setting that decides whether login, the emailed code, Google and Line
 * work lives in .env files, and those are gitignored on purpose. So a teammate
 * who pulls gets all of the code and none of the configuration, and the
 * symptoms are indirect: a code that never arrives is usually a code that
 * arrived somewhere else, and a missing Google button is a missing client id.
 *
 * Read-only. It never prints a secret's value — only whether it is set, and
 * whether two files agree about it.
 */

import { existsSync, readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const RESET = "\x1b[0m"
const paint = (code, text) => `\x1b[${code}m${text}${RESET}`
const red = (t) => paint(31, t)
const green = (t) => paint(32, t)
const yellow = (t) => paint(33, t)
const dim = (t) => paint(90, t)
const bold = (t) => paint(1, t)

const problems = []
const warnings = []

/** A .env file as a plain map. Values are read but never printed. */
function readEnv(path) {
  if (!existsSync(path)) return null
  const found = new Map()

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const at = trimmed.indexOf("=")
    if (at === -1) continue
    const key = trimmed.slice(0, at).trim()
    let value = trimmed.slice(at + 1).trim()
    // Quotes are part of the file format, not of the value.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    found.set(key, value)
  }
  return found
}

/** Is a port accepting connections? */
function reachable(port, host = "127.0.0.1", timeout = 1200) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    const done = (answer) => {
      socket.destroy()
      resolve(answer)
    }
    socket.setTimeout(timeout)
    socket.on("connect", () => done(true))
    socket.on("timeout", () => done(false))
    socket.on("error", () => done(false))
  })
}

function report(label, ok, detail, { fatal = true } = {}) {
  const mark = ok ? green("ok  ") : fatal ? red("FAIL") : yellow("warn")
  console.log(`  ${mark}  ${label}${detail ? dim("  — " + detail) : ""}`)
  if (!ok) (fatal ? problems : warnings).push(label)
}

const apiEnvPath = join(root, "apps", "api", ".env")
const webEnvPath = join(root, "apps", "web", ".env.local")
const apiExample = readEnv(join(root, "apps", "api", ".env.example"))
const webExample = readEnv(join(root, "apps", "web", ".env.example"))

console.log(bold("\nBidNest — setup check\n"))

// ---------------------------------------------------------------- env files
console.log(bold("Env files"))

const api = readEnv(apiEnvPath)
const web = readEnv(webEnvPath)

report(
  "apps/api/.env exists",
  api !== null,
  api ? null : "copy apps/api/.env.example to apps/api/.env"
)
report(
  "apps/web/.env.local exists",
  web !== null,
  web ? null : "copy apps/web/.env.example to apps/web/.env.local"
)

const set = (env, key) => Boolean(env?.get(key)?.trim())

if (api) {
  console.log(bold("\napps/api — required to boot at all"))
  report("DATABASE_URL", set(api, "DATABASE_URL"))
  report("PORT", set(api, "PORT"))
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    const value = (api.get(key) ?? "").trim()
    report(
      key,
      value.length >= 32,
      value ? "must be at least 32 characters" : "not set"
    )
    // .env.example carries a placeholder long enough to pass the length rule,
    // so everyone who copies it shares one signing key — and a token minted on
    // any of their machines would be accepted on all the others.
    if (value && value === apiExample?.get(key)?.trim()) {
      report(`${key} is still the example's placeholder`, false, "generate your own", {
        fatal: false
      })
    }
  }
}

if (web) {
  console.log(bold("\napps/web — required to boot at all"))
  report("AUTH_SECRET", set(web, "AUTH_SECRET"), "the app will not start without it")
  report("NEXT_PUBLIC_API_URL", set(web, "NEXT_PUBLIC_API_URL"), null, {
    fatal: false
  })
  if (set(web, "AUTH_SECRET") && web.get("AUTH_SECRET") === webExample?.get("AUTH_SECRET")) {
    report("AUTH_SECRET is still the example's placeholder", false, "generate your own", {
      fatal: false
    })
  }
}

// ------------------------------------------------------------------ sign-in
// Reported even when one of the two files is missing — a missing web env is
// exactly the case where somebody is asking why the buttons are not there,
// and skipping the section would answer nothing.
{
  console.log(bold("\nGoogle sign-in (AUTH-003)"))
  const webGoogle = web?.get("NEXT_PUBLIC_GOOGLE_CLIENT_ID")?.trim()
  const apiGoogle = api?.get("GOOGLE_CLIENT_ID")?.trim()

  if (!webGoogle && !apiGoogle) {
    report("Google sign-in not configured", false, "the button stays hidden until both are set", {
      fatal: false
    })
  } else {
    report("apps/web NEXT_PUBLIC_GOOGLE_CLIENT_ID", Boolean(webGoogle))
    report("apps/api GOOGLE_CLIENT_ID", Boolean(apiGoogle))
    // The web obtains the token, the API checks it was issued for the same
    // client. Two different ids means every Google sign-in answers 401.
    report(
      "the two ids match",
      Boolean(webGoogle) && webGoogle === apiGoogle,
      "web obtains the token, api verifies its audience"
    )
    console.log(
      dim(
        "        note: while the Google app is in Testing, only accounts added\n" +
          "        as Test users in Google Cloud Console can sign in"
      )
    )
  }

  console.log(bold("\nLine sign-in (AUTH-006)"))
  const webLineId = web?.get("LINE_CHANNEL_ID")?.trim()
  const webLineSecret = web?.get("LINE_CHANNEL_SECRET")?.trim()
  const apiLineId = api?.get("LINE_CHANNEL_ID")?.trim()

  if (!webLineId && !webLineSecret && !apiLineId) {
    report("Line sign-in not configured", false, "the button stays hidden until all three are set", {
      fatal: false
    })
  } else {
    report("apps/web LINE_CHANNEL_ID", Boolean(webLineId))
    report("apps/web LINE_CHANNEL_SECRET", Boolean(webLineSecret))
    report("apps/api LINE_CHANNEL_ID", Boolean(apiLineId))
    report(
      "the two ids match",
      Boolean(webLineId) && webLineId === apiLineId,
      "the id that starts the flow must be the one that verifies it"
    )
    const origin = web?.get("AUTH_URL")?.trim() || "http://localhost:3000"
    console.log(
      dim(
        `        note: ${origin}/api/auth/line/callback must be listed as a\n` +
          "        Callback URL at developers.line.biz, byte for byte"
      )
    )
  }
}

// --------------------------------------------------------------------- mail
if (api) {
  console.log(bold("\nWhere the login code is delivered (AUTH-007)"))
  const host = api.get("MAIL_HOST")?.trim() || "localhost"
  const port = api.get("MAIL_PORT")?.trim() || "1025"
  const user = api.get("MAIL_USER")?.trim()
  const password = api.get("MAIL_PASSWORD")?.trim()
  const isMaildev = host === "localhost" || host === "127.0.0.1"

  if (isMaildev) {
    console.log(
      `  ${green("ok  ")}  Maildev ${dim(`(${host}:${port})`)}\n` +
        `        ${bold("the code will NOT reach a real inbox")}\n` +
        `        read it at ${bold("http://localhost:1080")}`
    )
  } else {
    console.log(`  ${green("ok  ")}  real relay ${dim(`(${host}:${port})`)}`)
    report(
      "MAIL_USER and MAIL_PASSWORD both set",
      Boolean(user) === Boolean(password) && Boolean(user),
      "half a credential makes the relay refuse the connection"
    )
    if (password && /\s/.test(password)) {
      report(
        "MAIL_PASSWORD has no spaces in it",
        false,
        "Gmail shows App Passwords in groups of four — the spaces are not part of it"
      )
    }
  }
}

// ----------------------------------------------------------------- services
console.log(bold("\nServices"))

const dbPort = Number(
  api?.get("DATABASE_URL")?.match(/:(\d+)\//)?.[1] ?? 5433
)
const apiPort = Number(api?.get("PORT") ?? 4000)

report(
  `postgres on ${dbPort}`,
  await reachable(dbPort),
  "docker compose -f infra/docker/compose.dev.yml up -d"
)

if (!api || (api.get("MAIL_HOST")?.trim() || "localhost") === "localhost") {
  const up = await reachable(1025)
  report(
    "maildev on 1025",
    up,
    up
      ? "inbox at http://localhost:1080"
      : "no code can be delivered — login will answer 500"
  )
}

report(`apps/api on ${apiPort}`, await reachable(apiPort), "pnpm dev:api", {
  fatal: false
})
report("apps/web on 3000", await reachable(3000), "pnpm dev:web", {
  fatal: false
})

// ------------------------------------------------------------------ verdict
console.log()
if (problems.length) {
  console.log(red(bold(`${problems.length} thing(s) to fix:`)))
  for (const p of problems) console.log(red(`  - ${p}`))
} else {
  console.log(green(bold("Nothing blocking sign-in.")))
}
if (warnings.length) {
  console.log(yellow(`\n${warnings.length} optional/not-running:`))
  for (const w of warnings) console.log(yellow(`  - ${w}`))
}
console.log()

process.exit(problems.length ? 1 : 0)
