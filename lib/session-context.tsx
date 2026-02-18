import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { TattooSession, Placement } from '@shared/schema';

const SESSIONS_KEY = '@tattoo_shop_sessions';

interface SessionContextValue {
  sessions: TattooSession[];
  isLoading: boolean;
  createSession: (name: string, designUri: string, designName: string, bodyImageUri?: string, extras?: Partial<TattooSession>) => Promise<TattooSession>;
  updateSession: (id: string, updates: Partial<TattooSession>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  getSession: (id: string) => TattooSession | undefined;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const DEFAULT_PLACEMENT: Placement = {
  anchorX: 0.5,
  anchorY: 0.5,
  scale: 1.0,
  rotationDeg: 0,
  opacity: 0.85,
  blendMode: 'multiply',
  warpIntensity: 0.2,
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TattooSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sessionsRef = useRef<TattooSession[]>([]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const stored = await AsyncStorage.getItem(SESSIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSessions(parsed);
        sessionsRef.current = parsed;
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSessions = async (newSessions: TattooSession[]) => {
    try {
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(newSessions));
    } catch (err) {
      console.error('Failed to save sessions:', err);
    }
  };

  const createSession = useCallback(async (
    name: string,
    designUri: string,
    designName: string,
    bodyImageUri?: string,
    extras?: Partial<TattooSession>,
  ): Promise<TattooSession> => {
    const now = new Date().toISOString();
    const session: TattooSession = {
      id: Crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      designUri,
      designName,
      bodyImageUri,
      stills: [],
      placement: DEFAULT_PLACEMENT,
      status: 'draft',
      ephemeral: true,
      previewMode: 'fresh',
      ...extras,
    };
    const updated = [session, ...sessionsRef.current];
    sessionsRef.current = updated;
    setSessions(updated);
    await saveSessions(updated);
    return session;
  }, []);

  const updateSession = useCallback(async (id: string, updates: Partial<TattooSession>) => {
    const current = sessionsRef.current;
    const updated = current.map((s) =>
      s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
    );
    sessionsRef.current = updated;
    setSessions(updated);
    await saveSessions(updated);
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    const current = sessionsRef.current;
    const updated = current.filter((s) => s.id !== id);
    sessionsRef.current = updated;
    setSessions(updated);
    await saveSessions(updated);
  }, []);

  const getSession = useCallback((id: string) => {
    return sessionsRef.current.find((s) => s.id === id);
  }, []);

  const value = useMemo(() => ({
    sessions,
    isLoading,
    createSession,
    updateSession,
    deleteSession,
    getSession,
  }), [sessions, isLoading, createSession, updateSession, deleteSession, getSession]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessions() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessions must be used within a SessionProvider');
  }
  return context;
}
