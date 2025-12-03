import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAjcMauPVcOcHbfUqQ0oHSBbLaBmckP25U",
  authDomain: "gengemztest-9582e.firebaseapp.com",
  projectId: "gengemztest-9582e",
  storageBucket: "gengemztest-9582e.firebasestorage.app",
  messagingSenderId: "189314077160",
  appId: "1:189314077160:web:a4ca2da49789d519a6145d",
  measurementId: "G-WK7HTBNZ4J"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const APP_ID = 'gengemz-prod'; 
export const BACKEND_URL = "https://us-central1-gengemztest-9582e.cloudfunctions.net/searchGames";