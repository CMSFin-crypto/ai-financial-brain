'use client';

import { useEffect } from 'react';

export function useVisitorTracking() {
  useEffect(() => {
    // Fire only once per session
    if (typeof window === 'undefined') return;
    const flag = sessionStorage.getItem('__visitor_tracked');
    if (flag) return;

    const payload = {
      page: window.location.pathname || '/',
      referrer: document.referrer || '',
      screenWidth: screen.width,
      screenHeight: screen.height,
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    };

    // Mark tracked immediately to prevent double-fire
    sessionStorage.setItem('__visitor_tracked', '1');

    // Fire and forget — silent fail
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silent — don't affect UX
    });
  }, []);
}
