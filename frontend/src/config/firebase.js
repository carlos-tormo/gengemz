import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// --- Firebase Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyAjcMauPVcOcHbfUq0oHSBbLaBmckP25U",
  authDomain: "gengemztest-958e.firebaseapp.com",
  projectId: "gengemztest-958e",
  storageBucket: "gengemztest-958e.firebasestorage.app",
  messagingSenderId: "189314077160",
  appId: "1:189314077160:web:a4ca2da49789d519a6145d",
  measurementId: "G-WK7HTBNZ4J"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
