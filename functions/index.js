import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();
const bucket = getStorage().bucket();

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Administrator access required.');
  }
}

export const approveSubmission = onCall({ maxInstances: 5 }, async (request) => {
  requireAdmin(request);
  const id = String(request.data?.submissionId || '');
  if (!/^[A-Za-z0-9_-]{10,150}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid submission ID.');
  const docRef = db.collection('submissions').doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Submission not found.');
  const data = snap.data();
  if (data.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending submissions can be approved.');
  let destinationPath = null;
  if (data.mediaPath) {
    if (!data.mediaPath.startsWith('submissions/')) throw new HttpsError('failed-precondition', 'Private media path is invalid.');
    const source = bucket.file(data.mediaPath);
    const [exists] = await source.exists();
    if (!exists) throw new HttpsError('not-found', 'Uploaded media is missing.');
    const filename = data.mediaPath.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
    destinationPath = `public/${id}/${filename}`;
    await source.copy(bucket.file(destinationPath));
    await bucket.file(destinationPath).setMetadata({
      contentType: data.mediaType || 'application/octet-stream',
      cacheControl: 'public,max-age=3600'
    });
  }
  const approvedData = {
    status: 'approved',
    moderatedAt: FieldValue.serverTimestamp(),
    moderatedBy: request.auth.uid
  };
  if (destinationPath) approvedData.publicMediaPath = destinationPath;
  await docRef.update(approvedData);
  return { success: true, publicMediaPath: destinationPath };
});

export const rejectSubmission = onCall({ maxInstances: 5 }, async (request) => {
  requireAdmin(request);
  const id = String(request.data?.submissionId || '');
  if (!/^[A-Za-z0-9_-]{10,150}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid submission ID.');
  const docRef = db.collection('submissions').doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Submission not found.');
  if (snap.data().status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending submissions can be rejected.');
  await docRef.update({ status: 'rejected', moderatedAt: FieldValue.serverTimestamp(), moderatedBy: request.auth.uid });
  return { success: true };
});
