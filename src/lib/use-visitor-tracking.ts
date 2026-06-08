'use client';

import { useEffect } from 'react';

/* Simple browser fingerprint — stable per browser/device */
function generateFingerprint(): string {
  try {
    const ua = navigator.userAgent || '';
    const lang = navigator.language || '';
    const screen = `${screen.width}x${screen.height}x${screen.colorDepth}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const platform = navigator.platform || '';
    // Canvas fingerprint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('fp', 0, 0);
    const canvasData = canvas.toDataURL().slice(-32);
    const raw = `${ua}|${lang}|${screen}|${tz}|${platform}|${canvasData}`;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      hash = ((hash << 5) - hash + ch) | 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
  } catch {
    return 'fp_' + Date.now().toString(36);
  }
}

/* Detect OS from user agent */
function detectOS(ua: string): string {
  if (/Windows NT 10/i.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6.3/i.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6.1/i.test(ua)) return 'Windows 7';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) {
    const ver = ua.match(/Mac OS X ([\d_]+)/);
    if (ver) return 'macOS ' + ver[1].replace(/_/g, '.');
    return 'macOS';
  }
  if (/iPhone OS ([\d_]+)/i.test(ua)) {
    const ver = ua.match(/iPhone OS ([\d_]+)/);
    if (ver) return 'iOS ' + ver[1].replace(/_/g, '.');
    return 'iOS';
  }
  if (/iPad.*OS ([\d_]+)/i.test(ua)) {
    const ver = ua.match(/iPad.*OS ([\d_]+)/);
    if (ver) return 'iPadOS ' + ver[1].replace(/_/g, '.');
    return 'iPadOS';
  }
  if (/Android ([\d.]+)/i.test(ua)) {
    const ver = ua.match(/Android ([\d.]+)/);
    if (ver) return 'Android ' + ver[1];
    return 'Android';
  }
  if (/CrOS/i.test(ua)) return 'Chrome OS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Tjetër';
}

/* Detect connection type */
function detectConnection(): string {
  const conn = (navigator as unknown as Record<string, { effectiveType?: string }>).connection;
  return conn?.effectiveType || 'unknown';
}

export function useVisitorTracking() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = sessionStorage.getItem('__visitor_tracked');
    if (flag) return;

    const ua = navigator.userAgent || '';
    const fingerprint = generateFingerprint();

    const payload = {
      fingerprint,
      page: window.location.pathname + window.location.search || '/',
      referrer: document.referrer || '',
      screenWidth: screen.width,
      screenHeight: screen.height,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1,
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      os: detectOS(ua),
      connectionType: detectConnection(),
      isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    };

    sessionStorage.setItem('__visitor_tracked', '1');

    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, []);
}
