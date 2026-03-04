import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStoredFirebaseConfig, isFirebaseConfigComplete } from "./appConfig";

const toAppName = (configKey: string) => `film-analyzer-${configKey}`;

const hashConfig = (raw: string) => {
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash));
};

export const getDb = () => {
  const firebaseConfig = getStoredFirebaseConfig();

  if (!isFirebaseConfigComplete(firebaseConfig)) {
    throw new Error("Firebase config is missing or invalid. Update it in Settings.");
  }

  const appName = toAppName(hashConfig(JSON.stringify(firebaseConfig)));
  const app = getApps().some((item) => item.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName);
  return getFirestore(app);
};

export const isFirebaseReady = () => isFirebaseConfigComplete(getStoredFirebaseConfig());
