/**
 * Generates everything the notification system needs, and prints it. Nothing is written to disk or to the database.
 *
 *   node scripts/notification-setup.mjs
 *
 * Put the three environment variables in .env.local and in Vercel (Production). Run the printed SQL ONCE in the
 * Supabase SQL editor: it stores only the SHA-256 of the dispatcher secret, never the secret itself.
 */
import { createHash, randomBytes } from 'node:crypto';
import webpush from 'web-push';

const vapid = webpush.generateVAPIDKeys();
const secret = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(secret).digest('hex');

console.log(`
# ---- Environment variables ---------------------------------------------------
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:YOUR-EMAIL@example.com
NOTIFICATION_DISPATCH_SECRET=${secret}

# ---- SQL (Supabase SQL editor, run once) -------------------------------------
insert into public.notification_worker_config (secret_sha256) values ('${hash}')
on conflict (id) do update set secret_sha256 = excluded.secret_sha256;

# Keep VAPID_PRIVATE_KEY and NOTIFICATION_DISPATCH_SECRET secret. Changing the public key later invalidates every
# existing device subscription (people would have to turn notifications on again).
`);
