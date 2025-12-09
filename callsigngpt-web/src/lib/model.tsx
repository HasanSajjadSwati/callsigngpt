'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type ModelCtx = {
  model: string;
  setModel: (m: string) => void;
};

const Ctx = createContext<ModelCtx>({ model: '', setModel: () => {} });

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [model, _setModel] = useState<string>('');

  // Load saved model from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('callsigngpt:model');
      if (saved) _setModel(saved);
    } catch {
      // ignore storage errors
    }
  }, []);

  const setModel = (m: string) => {
    _setModel(m);
    try {
      localStorage.setItem('callsigngpt:model', m);
    } catch {
      // ignore storage errors
    }
  };

  return <Ctx.Provider value={{ model, setModel }}>{children}</Ctx.Provider>;
}

export const useModel = () => useContext(Ctx);
