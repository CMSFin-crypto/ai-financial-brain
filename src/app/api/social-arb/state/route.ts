// GET /api/social-arb/state — gjendja për UI: kandidatët nga databaza,
// «Përditësuar më …», skanimet e fundit dhe shëndeti i burimeve.

import { readStore, storageInfo, backtestDir, storePath } from '@/lib/social-arb/store';
import { scanInProgress } from '@/lib/social-arb/engine';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const store = await readStore();
    const candidates = Object.values(store.candidates);
    // arkivi CSV në prapavijë — vetëm numërimi, jo përmbajtja
    let csvRows = 0;
    let csvFiles = 0;
    try {
      const files = fs.readdirSync(backtestDir()).filter(f => f.endsWith('.csv'));
      csvFiles = files.length;
      for (const f of files) {
        const lines = fs.readFileSync(path.join(backtestDir(), f), 'utf8').split('\n');
        csvRows += lines.filter(l => l.trim() && !l.startsWith('observed_at')).length;
      }
    } catch { /* pa arkiv */ }
    return Response.json({
      ok: true,
      lastScanAt: store.lastScanAt,
      scanning: scanInProgress(),
      candidates: candidates.sort((a, b) => b.score - a.score),
      counts: {
        WATCH: candidates.filter(c => c.status === 'WATCH').length,
        RESEARCH: candidates.filter(c => c.status === 'RESEARCH').length,
        REMOVED: candidates.filter(c => c.status === 'REMOVED').length,
        total: candidates.length,
      },
      lastScans: store.scans.slice(-8).reverse(),
      measurements: store.measurements.length,
      csvArchive: { files: csvFiles, rows: csvRows },
      storage: storageInfo(),
      storeFile: storePath(),
    });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
