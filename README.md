# Anonyma

Anonymous media sharing with moderated publishing.

## Stack
- Vite + vanilla JavaScript
- Firebase Authentication (anonymous visitors)
- Cloud Firestore
- Cloud Storage
- Vercel hosting

## Local development
1. npm install
2. npm run dev

The Firebase web app configuration is intentionally included in the client. Firebase web config is not a server secret. Security is enforced by Authentication, Firestore/Storage rules, and App Check.

## Publishing model
- New uploads are stored privately under submissions/{uid}/...
- Firestore submissions begin with status: pending.
- A trusted moderation backend must copy approved files to public/{submissionId}/... using the Firebase Admin SDK and set publicMediaPath plus status: approved.
- The public feed reads only approved Firestore records and their publicMediaPath.
- Never put Firebase service-account credentials in this repository or browser code.

## Firebase console checklist
Enable Anonymous Authentication, create Firestore and Storage, deploy firestore.rules and storage.rules, and enable App Check before public launch. Add authorized admin custom claims only from a trusted Admin SDK environment.

## Vercel
Import Zamyilton/anonyma as a Vite project. Build command: npm run build. Output directory: dist. No VITE Firebase environment variables are needed because the public web config is in src/firebase.js.
