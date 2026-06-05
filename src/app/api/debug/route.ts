import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    environment: {
      vercel: !!process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV,
    },
    aiProviders: {
      gemini: {
        configured: !!process.env.GEMINI_API_KEY,
        keyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 8) + '...' : 'NOT SET',
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash (default)',
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        keyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 8) + '...' : 'NOT SET',
      },
    },
    hint: process.env.GEMINI_API_KEY
      ? '✅ Gemini API key is set! AI should work.'
      : '❌ GEMINI_API_KEY is NOT SET! Add it in Vercel > Settings > Environment Variables.',
  });
}
