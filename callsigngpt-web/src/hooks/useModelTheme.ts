'use client';

import { useEffect } from 'react';
import { applyModelTheme } from '@/lib/theme';

export function useModelTheme(model: string) {
  useEffect(() => {
    applyModelTheme(model);
  }, [model]);
}
