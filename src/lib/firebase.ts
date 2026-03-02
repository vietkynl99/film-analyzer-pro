import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate config
const isPlaceholder = (val: string | undefined) => !val || val.includes("YOUR_") || val === "undefined";

const missingKeys = Object.entries(firebaseConfig)
  .filter(([key, value]) => isPlaceholder(value as string) && key !== 'measurementId')
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error("Firebase configuration is incomplete or using placeholders. Missing/Invalid keys:", missingKeys);
  console.warn("Please ensure you have set all VITE_FIREBASE_* environment variables in the Secrets panel with REAL values from your Firebase console.");
} else {
  console.log("Firebase configuration detected for project:", firebaseConfig.projectId);
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
