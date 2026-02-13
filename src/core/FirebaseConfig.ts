import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDiee03T6GUg3rL1BLocWqbSYEe63iCENY",
    authDomain: "oblivions-crypt.firebaseapp.com",
    projectId: "oblivions-crypt",
    storageBucket: "oblivions-crypt.firebasestorage.app",
    messagingSenderId: "1082239710771",
    appId: "1:1082239710771:web:799c4adb3ad0ea72701546"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
