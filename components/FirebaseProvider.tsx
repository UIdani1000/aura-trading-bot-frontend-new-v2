"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, User as FirebaseAuthUser, Auth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore'; // Import Firestore type here

// Declare global variables that are injected by the Canvas environment or Vercel build process.
// This tells TypeScript they exist, preventing 'Cannot find name' errors during compilation.
declare const __firebase_config: string;
declare const __initial_auth_token: string;


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
      // Safely parse __firebase_config, which is declared as a global const.
      // It's expected to be provided by the environment (Canvas or Vercel build).
      const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
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
      } else {
        // If no user, try to sign in anonymously using __initial_auth_token
        // This ensures a userId is always available for Firestore rules.
        // Safely check and use __initial_auth_token, which is declared as a global const.
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(authInstance, __initial_auth_token);
            setUserId(authInstance.currentUser?.uid || crypto.randomUUID()); // Ensure userId is set after token sign-in
            console.log("DIAG: Signed in with custom token.");
          } else {
            await signInAnonymously(authInstance);
            setUserId(authInstance.currentUser?.uid || crypto.randomUUID()); // Fallback to anonymous if token not available
            console.log("DIAG: Signed in anonymously (no initial token).");
          }
        } catch (error) {
          console.error("DIAG: Error during anonymous/custom token sign-in:", error);
          setUserId(crypto.randomUUID()); // Ensure a userId is always present even on sign-in error
        } finally {
          setIsAuthReady(true); // Mark auth as ready even if sign-in failed
        }
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
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
