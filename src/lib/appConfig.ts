export interface FirebaseRuntimeConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

const GEMINI_API_KEY_STORAGE_KEY = "film_analyzer_gemini_api_key";
const FIREBASE_CONFIG_STORAGE_KEY = "film_analyzer_firebase_config";

const DEFAULT_FIREBASE_CONFIG: FirebaseRuntimeConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

const hasWindow = () => typeof window !== "undefined" && !!window.localStorage;

export const getStoredGeminiApiKey = (): string => {
  if (!hasWindow()) return "";
  return (window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || "").trim();
};

export const setStoredGeminiApiKey = (value: string) => {
  if (!hasWindow()) return;
  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, trimmed);
};

export const getStoredFirebaseConfigRaw = (): string => {
  if (!hasWindow()) return "";
  return window.localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY) || "";
};

export const setStoredFirebaseConfigRaw = (value: string) => {
  if (!hasWindow()) return;
  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, trimmed);
};

const normalizeConfigShape = (input: any): FirebaseRuntimeConfig => ({
  apiKey: String(input?.apiKey ?? "").trim(),
  authDomain: String(input?.authDomain ?? "").trim(),
  databaseURL: String(input?.databaseURL ?? "").trim(),
  projectId: String(input?.projectId ?? "").trim(),
  storageBucket: String(input?.storageBucket ?? "").trim(),
  messagingSenderId: String(input?.messagingSenderId ?? "").trim(),
  appId: String(input?.appId ?? "").trim(),
  measurementId: String(input?.measurementId ?? "").trim(),
});

const parseLikeJsonObject = (raw: string): any => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Allow paste style: const firebaseConfig = { ... };
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Invalid Firebase config format.");
    }

    const objectLiteral = match[0]
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"');
    return JSON.parse(objectLiteral);
  }
};

export const parseFirebaseConfigInput = (raw: string): FirebaseRuntimeConfig | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return normalizeConfigShape(parseLikeJsonObject(trimmed));
};

export const isFirebaseConfigComplete = (config: FirebaseRuntimeConfig | null): boolean => {
  if (!config) return false;
  const requiredKeys: Array<keyof FirebaseRuntimeConfig> = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ];
  return requiredKeys.every((key) => !!config[key]);
};

export const getStoredFirebaseConfig = (): FirebaseRuntimeConfig | null => {
  const raw = getStoredFirebaseConfigRaw();
  if (!raw.trim()) return null;

  try {
    return parseFirebaseConfigInput(raw);
  } catch {
    return null;
  }
};

export const toPrettyFirebaseConfigJson = (config: FirebaseRuntimeConfig): string => {
  return JSON.stringify(
    {
      ...DEFAULT_FIREBASE_CONFIG,
      ...config,
    },
    null,
    2
  );
};

