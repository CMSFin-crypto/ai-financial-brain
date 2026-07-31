import { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * Parse NextRequest search params through a Zod schema.
 * Returns typed, validated params or throws ZodError.
 */
export function parseQuery<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): z.infer<T> {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  return schema.parse(raw);
}

/**
 * Safe version: returns { data } on success or { error } on failure.
 * Useful for routes that want custom error messages.
 */
export function safeParseQuery<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): { data?: z.infer<T>; error?: string } {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const data = schema.parse(raw);
    return { data };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
    }
    return { error: 'Invalid query parameters' };
  }
}
