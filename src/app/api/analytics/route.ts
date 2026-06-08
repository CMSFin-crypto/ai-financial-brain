import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'analytics.json');

interface Visit {
  id: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  fingerprint: string;
  page: string;
  referrer: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  pixelRatio: number;
  language: string;
  timezone: string;
  os: string;
  connectionType: string;
  isTouchDevice: boolean;
  country: string;
  device: string;
  browser: string;
  visitorNumber: number;
  isNewVisitor: boolean;
  visitCount: number;
}

interface AnalyticsData {
  visits: Visit[];
  fingerprintMap: Record<string, { visitorNumber: number; firstSeen: string; lastSeen: string; visitCount: number }>;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readData(): AnalyticsData {
  ensureDataDir();
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.fingerprintMap) data.fingerprintMap = {};
      return data;
    }
  } catch {
    // corrupted or unreadable file — start fresh
  }
  return { visits: [], fingerprintMap: {} };
}

function writeData(data: AnalyticsData) {
  ensureDataDir();
  // Keep only last 10000 visits
  if (data.visits.length > 10000) {
    data.visits = data.visits.slice(data.visits.length - 10000);
  }
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function parseDevice(ua: string): string {
  if (/Tablet|iPad|PlayBook|Silk|Kindle|Nexus 7|Nexus 9|Nexus 10/i.test(ua)) return 'Tablet';
  if (/Mobile|Android|iPhone|iPod|BlackBerry|Opera Mini|IEMobile|WPDesktop|webOS/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung';
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  if (/MSIE|Trident/i.test(ua)) return 'IE';
  return 'Tjetër';
}

async function lookupCountry(ip: string): Promise<string> {
  try {
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return 'Local';
    const res = await fetch(`https://ip-api.com/json/${ip}?fields=country_code,country`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.countryCode || data.country || 'Unknown';
    }
  } catch {
    // geo lookup failed silently
  }
  return 'Unknown';
}

function countryToFlag(code: string): string {
  if (code === 'Local') return '\u{1F3E0}';
  if (code === 'Unknown') return '\u{1F30D}';
  const c = code.toUpperCase();
  if (c.length !== 2) return '\u{1F30D}';
  const flag = String.fromCodePoint(
    ...[c.charCodeAt(0), c.charCodeAt(1)].map((ch) => 0x1F1E6 + ch - 65)
  );
  return flag;
}

function maskIP(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
  }
  if (parts.length === 8 && ip.includes(':')) {
    return `${parts[0]}:${parts[1]}:****:...`;
  }
  return ip.replace(/(.{2}).*(.{2})$/, '$1***$2');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// POST — Record a visit
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fingerprint,
      page,
      referrer,
      screenWidth,
      screenHeight,
      colorDepth,
      pixelRatio,
      language,
      timezone,
      os,
      connectionType,
      isTouchDevice,
    } = body;

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || '';

    const device = parseDevice(userAgent);
    const browser = parseBrowser(userAgent);
    const country = await lookupCountry(ip);

    const data = readData();

    // Track fingerprint → visitor number mapping
    const fp = fingerprint || 'fp_unknown';
    const now = new Date().toISOString();
    if (!data.fingerprintMap[fp]) {
      // Assign new visitor number (1-indexed)
      const maxNum = Object.values(data.fingerprintMap).reduce(
        (max, v) => Math.max(max, v.visitorNumber), 0
      );
      data.fingerprintMap[fp] = {
        visitorNumber: maxNum + 1,
        firstSeen: now,
        lastSeen: now,
        visitCount: 1,
      };
    } else {
      data.fingerprintMap[fp].lastSeen = now;
      data.fingerprintMap[fp].visitCount += 1;
    }

    const visitorInfo = data.fingerprintMap[fp];

    const visit: Visit = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      ip,
      userAgent,
      fingerprint: fp,
      page: page || '/',
      referrer: referrer || '',
      screenWidth: screenWidth || 0,
      screenHeight: screenHeight || 0,
      colorDepth: colorDepth || 0,
      pixelRatio: pixelRatio || 1,
      language: language || '',
      timezone: timezone || '',
      os: os || 'Tjetër',
      connectionType: connectionType || 'unknown',
      isTouchDevice: isTouchDevice || false,
      country,
      device,
      browser,
      visitorNumber: visitorInfo.visitorNumber,
      isNewVisitor: visitorInfo.visitCount === 1,
      visitCount: visitorInfo.visitCount,
    };

    data.visits.push(visit);
    writeData(data);

    return NextResponse.json({
      success: true,
      id: visit.id,
      visitorNumber: visitorInfo.visitorNumber,
    }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Failed to record visit' }, { status: 500, headers: corsHeaders });
  }
}

// GET — Return analytics stats
export async function GET() {
  try {
    const data = readData();
    const visits = data.visits;
    const now = new Date();

    const totalVisits = visits.length;

    const todayStr = now.toISOString().slice(0, 10);
    const todayVisits = visits.filter((v) => v.timestamp.slice(0, 10) === todayStr).length;

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last30Days = visits.filter((v) => new Date(v.timestamp) >= thirtyDaysAgo);
    const uniqueIPs = new Set(last30Days.map((v) => v.ip)).size;

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const onlineNow = visits.filter((v) => new Date(v.timestamp) >= fiveMinutesAgo).length;

    // Total unique fingerprints
    const totalUniqueVisitors = Object.keys(data.fingerprintMap).length;

    // Recent visitors (last 50) with enriched data
    const recentVisitors = visits.slice(-50).reverse().map((v) => {
      const fpInfo = data.fingerprintMap[v.fingerprint];
      return {
        id: v.id,
        time: new Date(v.timestamp).toLocaleString('sq-AL', { timeZone: v.timezone || 'Europe/Tirane' }),
        maskedIP: maskIP(v.ip),
        flag: countryToFlag(v.country),
        country: v.country,
        device: v.device,
        browser: v.browser,
        os: v.os,
        page: v.page,
        referrer: v.referrer,
        fingerprint: v.fingerprint,
        visitorNumber: v.visitorNumber,
        visitCount: fpInfo?.visitCount || 1,
        isNewVisitor: v.isNewVisitor,
        screenWidth: v.screenWidth,
        screenHeight: v.screenHeight,
        pixelRatio: v.pixelRatio,
        connectionType: v.connectionType,
        isTouchDevice: v.isTouchDevice,
        language: v.language,
      };
    });

    // Visits by country
    const countryMap = new Map<string, number>();
    for (const v of last30Days) {
      countryMap.set(v.country, (countryMap.get(v.country) || 0) + 1);
    }
    const visitsByCountry = Array.from(countryMap.entries())
      .map(([code, count]) => ({ code, count, flag: countryToFlag(code) }))
      .sort((a, b) => b.count - a.count);

    // Device breakdown
    const deviceMap: Record<string, number> = { Desktop: 0, Mobile: 0, Tablet: 0 };
    for (const v of last30Days) {
      deviceMap[v.device] = (deviceMap[v.device] || 0) + 1;
    }

    // Browser breakdown
    const browserMap = new Map<string, number>();
    for (const v of last30Days) {
      browserMap.set(v.browser, (browserMap.get(v.browser) || 0) + 1);
    }
    const browsers = Array.from(browserMap.entries())
      .sort((a, b) => b[1] - a[1]);

    // OS breakdown
    const osMap = new Map<string, number>();
    for (const v of last30Days) {
      osMap.set(v.os, (osMap.get(v.os) || 0) + 1);
    }
    const osList = Array.from(osMap.entries())
      .sort((a, b) => b[1] - a[1]);

    // Top pages
    const pageMap = new Map<string, number>();
    for (const v of last30Days) {
      pageMap.set(v.page, (pageMap.get(v.page) || 0) + 1);
    }
    const topPages = Array.from(pageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Visits per day (last 30 days)
    const dailyMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, 0);
    }
    for (const v of visits) {
      const key = v.timestamp.slice(0, 10);
      if (dailyMap.has(key)) {
        dailyMap.set(key, dailyMap.get(key)! + 1);
      }
    }
    const dailyVisits = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
      shortDate: date.slice(5),
    }));

    // Top visitors (by visit count)
    const topVisitors = Object.entries(data.fingerprintMap)
      .map(([fp, info]) => {
        const lastVisit = visits.filter((v) => v.fingerprint === fp).slice(-1)[0];
        return {
          fingerprint: fp,
          visitorNumber: info.visitorNumber,
          visitCount: info.visitCount,
          firstSeen: info.firstSeen,
          lastSeen: info.lastSeen,
          country: lastVisit?.country || 'Unknown',
          os: lastVisit?.os || 'Tjetër',
          device: lastVisit?.device || 'Desktop',
          browser: lastVisit?.browser || 'Tjetër',
        };
      })
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 20)
      .map((tv) => ({
        ...tv,
        flag: countryToFlag(tv.country),
      }));

    return NextResponse.json({
      totalVisits,
      todayVisits,
      uniqueVisitors: uniqueIPs,
      totalUniqueVisitors,
      onlineNow,
      recentVisitors,
      visitsByCountry,
      deviceBreakdown: deviceMap,
      browsers,
      osList,
      topPages,
      dailyVisits,
      topVisitors,
    }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500, headers: corsHeaders });
  }
}
