'use client';

import { useVisitorTracking } from '@/lib/use-visitor-tracking';

export function VisitorTracker() {
  useVisitorTracking();
  return null;
}
