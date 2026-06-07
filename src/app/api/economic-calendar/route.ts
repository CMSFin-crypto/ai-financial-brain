import { NextResponse } from 'next/server';

export const maxDuration = 30;

interface EconomicEvent {
  id: string;
  date: string;
  time: string;
  name: string;
  nameSq: string;
  category: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
  previousValue: string;
  forecastValue: string;
  country: string;
  descriptionSq: string;
}

// Helper to get the Nth weekday of a month (e.g., first Friday = getNthWeekday(year, month, 5, 1))
function getNthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  let day = 1 + ((weekday - firstDay + 7) % 7) + (n - 1) * 7;
  return new Date(year, month, day);
}

// Helper to get the last weekday of a month
function getLastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const lastDay = last.getDay();
  let day = last.getDate() - ((lastDay - weekday + 7) % 7);
  return new Date(year, month, day);
}

// Helper to get all Thursdays in a month
function getThursdaysInMonth(year: number, month: number): Date[] {
  const thursdays: Date[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    if (date.getDay() === 4) { // Thursday
      thursdays.push(date);
    }
  }
  return thursdays;
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

function seedRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateMonthEvents(year: number, month: number, seed: number): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const rand = seedRandom(seed);
  const monthIdx = seed * 31 + month * 7 + year;
  let idCounter = 0;

  const addEvent = (
    date: Date,
    time: string,
    name: string,
    nameSq: string,
    category: string,
    importance: 'HIGH' | 'MEDIUM' | 'LOW',
    previousValue: string,
    forecastValue: string,
    descriptionSq: string
  ) => {
    const r = rand();
    // Add some random variation to values
    events.push({
      id: `evt-${year}-${month}-${idCounter++}`,
      date: fmt(date),
      time,
      name,
      nameSq,
      category,
      importance,
      previousValue,
      forecastValue,
      country: 'US',
      descriptionSq,
    });
  };

  // NFP - First Friday
  const nfpDate = getNthWeekday(year, month, 5, 1);
  const nfpPrev = (150 + Math.floor(rand() * 80)).toString();
  const nfpForecast = (parseInt(nfpPrev) - 15 + Math.floor(rand() * 30)).toString();
  addEvent(
    nfpDate, '08:30',
    'Non-Farm Payrolls',
    'Punësimi jashtë bujqësisë (NFP)',
    'NFP', 'HIGH',
    `${nfpPrev}K`, `${nfpForecast}K`,
    'Treguesi më i rëndësishëm i punësimit në SHBA — lëvizë fort tregjet kur dallon nga pritjet.'
  );

  // CPI - around 13th (pick Tuesday or Wednesday)
  const cpiDay = 13;
  const cpiDate = new Date(year, month, cpiDay);
  const cpiPrev = (2.8 + rand() * 1.2).toFixed(1);
  const cpiForecast = (parseFloat(cpiPrev) - 0.2 + rand() * 0.4).toFixed(1);
  addEvent(
    cpiDate, '08:30',
    'CPI (Consumer Price Index)',
    'Indeksi i çmimeve për konsumatorë (CPI)',
    'CPI', 'HIGH',
    `${cpiPrev}%`, `${cpiForecast}%`,
    'Masa kryesore e inflacionit — ndikon drejtpërdrejt në vendimet e Fed-it për interesat.'
  );

  // Core CPI - same day as CPI, 30 min later
  const coreCpiPrev = (3.0 + rand() * 1.0).toFixed(1);
  const coreCpiForecast = (parseFloat(coreCpiPrev) - 0.1 + rand() * 0.3).toFixed(1);
  addEvent(
    cpiDate, '08:30',
    'Core CPI (ex Food & Energy)',
    'CPI Bazë (pa ushqim dhe energji)',
    'CPI', 'HIGH',
    `${coreCpiPrev}%`, `${coreCpiForecast}%`,
    'CPI bazë është më i rëndësishëm për Fed-in sepse heq koston e volitshme të ushqimit dhe energjisë.'
  );

  // PPI - around 11-14th
  const ppiDay = 14;
  const ppiDate = new Date(year, month, ppiDay);
  const ppiPrev = (1.8 + rand() * 1.5).toFixed(1);
  const ppiForecast = (parseFloat(ppiPrev) - 0.2 + rand() * 0.4).toFixed(1);
  addEvent(
    ppiDate, '08:30',
    'Producer Price Index (PPI)',
    'Indeksi i çmimeve të prodhuesit (PPI)',
    'PPI', 'MEDIUM',
    `${ppiPrev}%`, `${ppiForecast}%`,
    'Tregon çmimet në nivel të prodhimit — parashikon presionin e inflacionit për konsumatorët.'
  );

  // GDP - around 26-30th (Thursday)
  const gdpDay = 26;
  const gdpDate = new Date(year, month, gdpDay);
  const gdpPrev = (1.5 + rand() * 3.5).toFixed(1);
  const gdpForecast = (parseFloat(gdpPrev) - 0.5 + rand() * 1.0).toFixed(1);
  addEvent(
    gdpDate, '08:30',
    'GDP Growth Rate',
    'Norma e rritjes së PBB-së',
    'GDP', 'HIGH',
    `${gdpPrev}%`, `${gdpForecast}%`,
    'Masa më e gjerë e aktivitetit ekonomik — rritjet e forta nxisin tregjet, rënia i trondit ato.'
  );

  // PMI Manufacturing - 1st-3rd
  const pmiMfgDay = 2;
  const pmiMfgDate = new Date(year, month, pmiMfgDay);
  const pmiMfgPrev = (48 + Math.floor(rand() * 8)).toString();
  const pmiMfgForecast = (parseInt(pmiMfgPrev) - 2 + Math.floor(rand() * 5)).toString();
  addEvent(
    pmiMfgDate, '09:45',
    'Manufacturing PMI',
    'PMI i prodhimit',
    'PMI', 'MEDIUM',
    pmiMfgPrev, pmiMfgForecast,
    'Mbi 50 = zgjerim, nën 50 = tkurrje. Tregon shëndetin e sektorit industrial.'
  );

  // PMI Services - 4th-6th
  const pmiSvcDay = 5;
  const pmiSvcDate = new Date(year, month, pmiSvcDay);
  const pmiSvcPrev = (50 + Math.floor(rand() * 8)).toString();
  const pmiSvcForecast = (parseInt(pmiSvcPrev) - 1 + Math.floor(rand() * 4)).toString();
  addEvent(
    pmiSvcDate, '09:45',
    'Services PMI (ISM)',
    'PMI i shërbimeve (ISM)',
    'PMI', 'MEDIUM',
    pmiSvcPrev, pmiSvcForecast,
    'Sektori i shërbimeve është 70% të ekonomisë — PMI i tij është tregues kyç.'
  );

  // Retail Sales - around 15th
  const retailDay = 15;
  const retailDate = new Date(year, month, retailDay);
  const retailPrev = (0.2 + rand() * 0.8).toFixed(1);
  const retailForecast = (parseFloat(retailPrev) - 0.2 + rand() * 0.5).toFixed(1);
  addEvent(
    retailDate, '08:30',
    'Retail Sales',
    'Shitjet me pakicë',
    'RETAIL', 'HIGH',
    `${retailPrev}%`, `${retailForecast}%`,
    'Tregon sa po shpenzojnë konsumatorët — lëviz tregjet sepse konsumi është 70% e PBB-së.'
  );

  // Consumer Confidence - Last Tuesday
  const ccDate = getLastWeekday(year, month, 2); // Tuesday
  const ccPrev = (95 + Math.floor(rand() * 20)).toString();
  const ccForecast = (parseInt(ccPrev) - 5 + Math.floor(rand() * 10)).toString();
  addEvent(
    ccDate, '10:00',
    'Consumer Confidence',
    'Besimi i konsumatorëve',
    'CONSUMER', 'MEDIUM',
    ccPrev, ccForecast,
    'Nëse konsumatorët janë optimistë, shpenzojnë më shumë — nxit aksionet.'
  );

  // University of Michigan Consumer Sentiment - mid-month Friday
  const umDay = 12;
  const umDate = new Date(year, month, umDay);
  const umPrev = (65 + Math.floor(rand() * 20)).toString();
  const umForecast = (parseInt(umPrev) - 3 + Math.floor(rand() * 6)).toString();
  addEvent(
    umDate, '09:55',
    'U. Michigan Consumer Sentiment (Prelim)',
    'Sentimenti i konsumatorëve Michigan (paraprak)',
    'CONSUMER', 'MEDIUM',
    umPrev, umForecast,
    'Anketë e hershme — tregon si ndihen konsumatorët për ekonominë.'
  );

  // Housing Starts - 16-19th
  const housingDay = 17;
  const housingDate = new Date(year, month, housingDay);
  const housingPrev = (1.2 + rand() * 0.5).toFixed(2);
  const housingForecast = (parseFloat(housingPrev) - 0.1 + rand() * 0.3).toFixed(2);
  addEvent(
    housingDate, '08:30',
    'Housing Starts',
    'Fillimet e ndërtimeve banesore',
    'HOUSING', 'MEDIUM',
    `${housingPrev}M`, `${housingForecast}M`,
    'Tregon aktivitetin ndërtimor — ndikon në aksionet e sektorit të pasurive.'
  );

  // Building Permits - same day
  const permitsPrev = (1.4 + rand() * 0.4).toFixed(2);
  const permitsForecast = (parseFloat(permitsPrev) - 0.1 + rand() * 0.2).toFixed(2);
  addEvent(
    housingDate, '08:30',
    'Building Permits',
    'Lejet e ndërtimit',
    'HOUSING', 'LOW',
    `${permitsPrev}M`, `${permitsForecast}M`,
    'Parashikon se sa ndërtime do të bëhen — tregues i avancuar i sektorit.'
  );

  // Existing Home Sales - around 22nd
  const ehsDay = 22;
  const ehsDate = new Date(year, month, ehsDay);
  const ehsPrev = (3.8 + rand() * 0.8).toFixed(1);
  const ehsForecast = (parseFloat(ehsPrev) - 0.2 + rand() * 0.4).toFixed(1);
  addEvent(
    ehsDate, '10:00',
    'Existing Home Sales',
    'Shitjet e shtëpive ekzistuese',
    'HOUSING', 'LOW',
    `${ehsPrev}M`, `${ehsForecast}M`,
    'Tregon tregun e pasurive — ndikon në agresivitetin ekonomik.'
  );

  // Industrial Production - 15-17th
  const ipDay = 16;
  const ipDate = new Date(year, month, ipDay);
  const ipPrev = (-0.3 + rand() * 0.8).toFixed(1);
  const ipForecast = (parseFloat(ipPrev) - 0.1 + rand() * 0.3).toFixed(1);
  addEvent(
    ipDate, '09:15',
    'Industrial Production',
    'Prodhimi industrial',
    'MANUFACTURING', 'MEDIUM',
    `${ipPrev}%`, `${ipForecast}%`,
    'Masa e prodhimit në fabrika, miniera dhe shkrepje — tregon forcën ekonomike.'
  );

  // Durable Goods Orders - 24-27th
  const dgDay = 24;
  const dgDate = new Date(year, month, dgDay);
  const dgPrev = (-0.5 + rand() * 2.0).toFixed(1);
  const dgForecast = (parseFloat(dgPrev) - 0.3 + rand() * 0.6).toFixed(1);
  addEvent(
    dgDate, '08:30',
    'Durable Goods Orders',
    'Porositë e mallrave të qëndrueshme',
    'MANUFACTURING', 'MEDIUM',
    `${dgPrev}%`, `${dgForecast}%`,
    'Porositë për makineri, avionë, pajtime — tregon investimet e bizneseve.'
  );

  // Jobless Claims - first and third Thursday
  const thursdays = getThursdaysInMonth(year, month);
  if (thursdays.length >= 1) {
    const jc1Date = thursdays[0];
    const jc1Prev = (210 + Math.floor(rand() * 30)).toString();
    const jc1Forecast = (parseInt(jc1Prev) - 10 + Math.floor(rand() * 20)).toString();
    addEvent(
      jc1Date, '08:30',
      'Initial Jobless Claims',
      'Kërkesa fillestare për të papunë',
      'JOBLESS', 'MEDIUM',
      `${jc1Prev}K`, `${jc1Forecast}K`,
      'Numri i njerëzve që aplikojnë për të papunë për herë të parë — vërehet çdo javë.'
    );
  }
  if (thursdays.length >= 3) {
    const jc3Date = thursdays[2];
    const jc3Prev = (210 + Math.floor(rand() * 30)).toString();
    const jc3Forecast = (parseInt(jc3Prev) - 10 + Math.floor(rand() * 20)).toString();
    addEvent(
      jc3Date, '08:30',
      'Initial Jobless Claims',
      'Kërkesa fillestare për të papunë',
      'JOBLESS', 'MEDIUM',
      `${jc3Prev}K`, `${jc3Forecast}K`,
      'Numri i njerëzve që aplikojnë për të papunë për herë të parë — vërehet çdo javë.'
    );
  }

  // FOMC Meeting - approximately every 6 weeks
  // We'll place FOMC meetings on specific months with deterministic pattern
  const fomcMonths = [0, 1, 2, 4, 5, 6, 8, 9, 10, 11]; // Jan, Feb, Mar, May, Jun, Jul, Sep, Oct, Nov, Dec
  if (fomcMonths.includes(month)) {
    const fomcDay = 28; // 2-day meeting, decision on second day
    const fomcDate = new Date(year, month, fomcDay);
    addEvent(
      fomcDate, '14:00',
      'FOMC Interest Rate Decision',
      'Vendimi i FOMC për normën e interesit',
      'FED', 'HIGH',
      '5.25-5.50%', '5.25-5.50%',
      'Vendimi më i rëndësishëm i muajit — përcakton normën e interesit dhe lëviz çdo treg.'
    );

    // FOMC Press Conference
    addEvent(
      fomcDate, '14:30',
      'Fed Chair Press Conference',
      'Konferenca për shtyp e kryetares së Fed-it',
      'FED', 'HIGH',
      '-', '-',
      'Kryetari i Fed-it shpjegon vendimin — tregjet analizojnë çdo fjalë.'
    );
  }

  // Fed Speakers - add a few per month
  const speakerDays = [3, 10, 18];
  const speakerNames = [
    { name: 'Fed Gov. Waller Speaks', nameSq: 'Guvernatori i Fed-it Waller flet' },
    { name: 'Fed Gov. Bowman Speaks', nameSq: 'Guvernatorja e Fed-it Bowman flet' },
    { name: 'Fed Gov. Kugler Speaks', nameSq: 'Guvernatorja e Fed-it Kugler flet' },
  ];
  speakerDays.forEach((d, i) => {
    if (d <= 28) {
      const sDate = new Date(year, month, d);
      const speaker = speakerNames[i % speakerNames.length];
      addEvent(
        sDate, '13:00',
        speaker.name,
        speaker.nameSq,
        'FED', 'LOW',
        '-', '-',
        'Zyrtar i Fed-it flet mbi ekonominë — tregjet vërejnë për sinjale të politikës monetare.'
      );
    }
  });

  // Treasury Auctions - a few per month
  const auctionDays = [9, 16, 23];
  const auctionTypes = [
    { name: '3-Month Treasury Bill Auction', nameSq: 'Aksion i bonit të thesarit 3 mujor' },
    { name: '10-Year Treasury Note Auction', nameSq: 'Aksion i bonit të thesarit 10-vjeçar' },
    { name: '30-Year Treasury Bond Auction', nameSq: 'Aksion i obligacionit 30-vjeçar të thesarit' },
  ];
  auctionDays.forEach((d, i) => {
    if (d <= 28) {
      const aDate = new Date(year, month, d);
      const auction = auctionTypes[i % auctionTypes.length];
      addEvent(
        aDate, '13:00',
        auction.name,
        auction.nameSq,
        'TREASURY', 'LOW',
        '-', '-',
        'Aksion i borxhit qeveritar — rezultatet ndikojnë në rendimentet.'
      );
    }
  });

  return events;
}

export async function GET() {
  try {
    const now = new Date();
    const events: EconomicEvent[] = [];

    // Generate events for current month and next 2 months
    for (let i = 0; i < 3; i++) {
      const year = now.getFullYear();
      const month = now.getMonth() + i;
      const targetYear = year + Math.floor(month / 12);
      const targetMonth = month % 12;
      const seed = targetYear * 13 + targetMonth * 7 + 42;
      const monthEvents = generateMonthEvents(targetYear, targetMonth, seed);

      // Filter out past events (only for current month)
      monthEvents.forEach((evt) => {
        const evtDate = new Date(evt.date + 'T23:59:59');
        if (i > 0 || evtDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          events.push(evt);
        }
      });
    }

    // Sort by date, then time
    events.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    // Group by week
    const byWeek: { weekStart: string; weekEnd: string; events: EconomicEvent[] }[] = [];
    let currentWeekStart: string | null = null;

    events.forEach((evt) => {
      const evtDate = new Date(evt.date + 'T00:00:00');
      const dayOfWeek = evtDate.getDay();
      const weekStart = new Date(evtDate);
      weekStart.setDate(evtDate.getDate() - ((dayOfWeek + 6) % 7)); // Monday
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // Sunday
      const wsKey = fmt(weekStart);

      if (wsKey !== currentWeekStart) {
        currentWeekStart = wsKey;
        byWeek.push({
          weekStart: wsKey,
          weekEnd: fmt(weekEnd),
          events: [],
        });
      }
      byWeek[byWeek.length - 1].events.push(evt);
    });

    // Next 7 days events
    const nextWeekEnd = new Date(now);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    const next7DaysEvents = events.filter((evt) => {
      const evtDate = new Date(evt.date + 'T00:00:00');
      return evtDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && evtDate <= nextWeekEnd;
    });

    return NextResponse.json({
      events,
      byWeek,
      next7Days: next7DaysEvents,
      totalEvents: events.length,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    console.error('Economic Calendar error:', message);
    return NextResponse.json({ error: 'Të dhënat e kalendarit ekonomik nuk u gjetën.' }, { status: 500 });
  }
}
