import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Turns existing accounts into admins, named by email in ADMIN_EMAILS.
 *
 * No endpoint changes a user's role, deliberately: an API that can hand out
 * ADMIN is an API that can be tricked into handing out ADMIN. Promotion is
 * rare enough to be a deliberate act performed against the database, and this
 * is that act.
 *
 * It only ever moves an account that already exists from USER to ADMIN. It
 * creates nobody, sets no password, and touches no other field — which is why
 * it is safe to keep in a public repository. Everyone signs themselves up
 * through the real flow, with their own password and their own inbox for the
 * one-time code, and this only changes what they are allowed to do afterwards.
 *
 * On a deployed environment, run it from the platform's console so it reaches
 * the database over the private network and nothing has to be exposed:
 *
 *   node apps/api/dist/prisma/promote-admins.js
 *
 * Re-running is harmless: an account that is already an admin is reported and
 * left alone. Add someone later by extending ADMIN_EMAILS and running again.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

type Outcome =
  | { kind: 'promoted'; email: string }
  | { kind: 'already'; email: string }
  | { kind: 'missing'; email: string }
  | { kind: 'ambiguous'; email: string; found: string[] };

async function promote(email: string): Promise<Outcome> {
  // Nothing in the app lowercases an address before storing it, so a capital
  // letter in the sign-up form is a capital letter in the table. Matching
  // case-insensitively keeps a typo in ADMIN_EMAILS from silently promoting
  // nobody; the account that actually matched is printed back either way.
  const matches = await prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, role: true }
  });

  if (matches.length === 0) return { kind: 'missing', email };

  // Two accounts differing only in case is not something to resolve by
  // guessing which one was meant.
  if (matches.length > 1) {
    return { kind: 'ambiguous', email, found: matches.map((m) => m.email) };
  }

  const user = matches[0];
  if (user.role === 'ADMIN') return { kind: 'already', email: user.email };

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' }
  });
  return { kind: 'promoted', email: user.email };
}

async function main() {
  const raw = process.env.ADMIN_EMAILS?.trim();

  if (!raw) {
    console.error(
      'ADMIN_EMAILS is not set. Give it the addresses to promote, separated\n' +
        'by commas, and make sure each one has already signed up:\n\n' +
        '  ADMIN_EMAILS="one@example.com,two@example.com"\n'
    );
    process.exit(1);
  }

  const emails = [
    ...new Set(
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ];

  const outcomes: Outcome[] = [];
  for (const email of emails) {
    outcomes.push(await promote(email));
  }

  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'promoted':
        console.log(`  promoted   ${outcome.email}`);
        break;
      case 'already':
        console.log(`  already    ${outcome.email}`);
        break;
      case 'missing':
        console.log(`  no account ${outcome.email}`);
        break;
      case 'ambiguous':
        console.log(
          `  ambiguous  ${outcome.email} matches ${outcome.found.join(', ')}`
        );
        break;
    }
  }

  const promoted = outcomes.filter((o) => o.kind === 'promoted').length;
  const unresolved = outcomes.filter(
    (o) => o.kind === 'missing' || o.kind === 'ambiguous'
  );

  console.log(
    `\n${promoted} promoted, ${outcomes.length - promoted - unresolved.length} already admin, ${unresolved.length} unresolved.`
  );

  if (promoted > 0) {
    console.log(
      'An admin can suspend accounts, cancel auctions and edit any listing,\n' +
        'so keep this list to the people who need it.'
    );
  }

  // A name that matched nothing is almost always a typo or somebody who has
  // not signed up yet, and both are worth failing loudly over rather than
  // leaving in a wall of output nobody reads to the end.
  if (unresolved.length > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
