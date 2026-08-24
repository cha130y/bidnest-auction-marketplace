/**
 * Tests never send real mail.
 *
 * ConfigModule.forRoot() names no envFilePath, so it reads the same `.env` the
 * dev server does — and once that file points at a real relay, an e2e run would
 * mail several hundred one-time codes to whatever addresses the fixtures made
 * up, burn a day's sending quota, and then fail anyway, because the specs read
 * their codes back out of Maildev.
 *
 * Set before anything imports Nest. @nestjs/config does not overwrite a key
 * that is already in process.env, so these win over the file.
 */
process.env.MAIL_HOST = 'localhost';
process.env.MAIL_PORT = '1025';
process.env.MAIL_FROM = 'BidNest <no-reply@bidnest.local>';
// Blanked rather than deleted, and the difference is the whole trick: the
// loader fills in keys that are *absent* from process.env, so deleting one
// invites the real `.env` value straight back in. An empty string is present,
// so it stands — and the schema reads blank as unset.
process.env.MAIL_USER = '';
process.env.MAIL_PASSWORD = '';
process.env.MAIL_SECURE = '';
