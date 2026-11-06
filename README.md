# Anonyma

Anonymous Media is a Firebase-backed media submission and moderated publishing platform.

## Stack
- Vite + vanilla JavaScript
- Firebase Authentication (anonymous visitors; admin accounts)
- Cloud Firestore
- Cloud Storage
- Cloud Functions (planned)

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and add Firebase web app configuration.
3. `npm run dev`

Do not put Firebase Admin credentials or service account keys in the browser.

The public submission flow stores records as `pending`. Only approved submissions should be readable from the public feed. Deploy the Firestore and Storage rules before enabling uploads.
