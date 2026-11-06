import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [uid, action = 'grant'] = process.argv.slice(2);

if (!uid || !['grant', 'revoke'].includes(action)) {
  console.error('Usage: node set-admin.mjs <FIREBASE_AUTH_UID> [grant|revoke]');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: 'anonyma-media',
});

const auth = getAuth();
const user = await auth.getUser(uid);
const claims = { ...(user.customClaims || {}) };

if (action === 'grant') {
  claims.admin = true;
} else {
  delete claims.admin;
}

await auth.setCustomUserClaims(uid, claims);
console.log(`Admin claim ${action === 'grant' ? 'granted to' : 'revoked from'} ${user.email || uid}.`);
console.log('The user must sign out and sign in again to refresh their ID token.');
