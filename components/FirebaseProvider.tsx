"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, User as FirebaseAuthUser, Auth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore'; // Import Firestore type here

// IMPORTANT: In Next.js, client-side environment variables must be prefixed with NEXT_PUBLIC_
// These will be replaced at build time with their actual values from Vercel.

// Define the shape of the Firebase context
interface FirebaseContextType {
  db: Firestore | null;
  auth: Auth | null;
  userId: string | null;
  isAuthReady: boolean;
}

// Create the context with a default null value
const FirebaseContext = createContext<FirebaseContextType | null>(null);

// Firebase Provider component
interface FirebaseProviderProps {
  children: ReactNode;
}

export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({ children }) => {
  const [db, setDb] = useState<Firestore | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false); // New state to track auth readiness

  useEffect(() => {
    let app;
    // Check if Firebase app is already initialized
    if (!getApps().length) {
      // Reconstruct firebaseConfig using NEXT_PUBLIC_ environment variables
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
      };

      // Basic validation for critical config
      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        console.error("DIAG: Firebase config missing critical properties:", firebaseConfig);
        setIsAuthReady(true); // Mark as ready to avoid infinite loading, but with error
        return;
      }

      app = initializeApp(firebaseConfig as any); // Cast to any to bypass TS type strictness for partial config
      console.log("DIAG: Firebase app initialized via NEXT_PUBLIC_ env vars.");
    } else {
      app = getApp();
      console.log("DIAG: Firebase app already initialized.");
    }

    const firestoreInstance = getFirestore(app);
    const authInstance = getAuth(app);

    setDb(firestoreInstance);
    setAuth(authInstance);

    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
      if (user) {
        setUserId(user.uid);
        setIsAuthReady(true);
        console.log("DIAG: Auth state changed: User is logged in with UID:", user.uid);
      } else {
        // If no user, try to sign in anonymously or with custom token from env
        try {
          const initialAuthToken = process.env.NEXT_PUBLIC_INITIAL_AUTH_TOKEN;

          if (initialAuthToken) {
            await signInWithCustomToken(authInstance, initialAuthToken);
            console.log("DIAG: Signed in with NEXT_PUBLIC_INITIAL_AUTH_TOKEN.");
          } else {
            // This is the default path for initial anonymous users
            await signInAnonymously(authInstance);
            console.log("DIAG: Signed in anonymously (no initial token provided).");
          }
          setUserId(authInstance.currentUser?.uid || crypto.randomUUID());
        } catch (error) {
          console.error("DIAG: Error during anonymous/custom token sign-in:", error);
          // Fallback to a random UUID if authentication fails, to allow app to proceed somewhat
          setUserId(crypto.randomUUID());
        } finally {
          setIsAuthReady(true); // Mark auth as ready regardless of success to allow UI to render
          console.log("DIAG: Firebase Auth readiness set to true.");
        }
      }
    });

    // Cleanup subscription on unmount
    return () => {
      console.log("DIAG: Cleaning up Firebase auth listener.");
      unsubscribe();
    };
  }, []); // Empty dependency array means this runs once on mount

  // Provide the Firebase instances and userId to children
  const contextValue = { db, auth, userId, isAuthReady };

  return (
    <FirebaseContext.Provider value={contextValue}>
      {children}
    </FirebaseContext.Provider>
  );
};

// Custom hook to use Firebase context
export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
