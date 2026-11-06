import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyBHf-s-lk1Zsj2V1yC__MLDBZAgypqA6cdM',
  authDomain: 'anonyma-media.firebaseapp.com',
  projectId: 'anonyma-media',
  storageBucket: 'anonyma-media.firebasestorage.app',
  messagingSenderId: '300117253951',
  appId: '1:300117253951:web:71894a402c6ca9173bfd8a',
  measurementId: 'G-JSRVLVBGFW',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) getAnalytics(app);
  }).catch((error) => console.warn('Firebase Analytics unavailable:', error));
}

export async function ensureAnonymousSession() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}
