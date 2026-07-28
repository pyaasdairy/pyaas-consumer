import { requireUserId } from './session';
import { getRows, setRows } from './localStore';
import { isBackendConfigured } from './apiClient';

/**
 * PYAAS quality data (local-first). PYAAS sources from a multi-dairy cooperative
 * federation, so quality is honest and batch-level: every pack traces to a
 * member district dairy union + its plant and the lab tests that batch passed
 * (FAT, SNF, temperature and an adulteration screen for water/starch/detergent).
 *
 * Runs fully offline on AsyncStorage: the first read seeds a realistic set of
 * recent test records per user so the dashboard looks alive in the demo. When
 * the NestJS backend is live these map to GET /quality/tests and the seed is
 * dropped in favour of the API response.
 *
 * TODO(api): GET /quality/tests -> QualityTest[] (most recent first).
 */

export type QualityTest = {
  id: string;
  batch_code: string;
  union_name: string;   // member district cooperative dairy union
  plant: string;        // the union's processing / chilling plant
  tested_at: string;    // ISO date of the lab test
  fat: number;          // FAT %, lab-measured
  snf: number;          // SNF %, lab-measured
  temperature_c: number; // cold-chain reading at dispatch
  adulteration_passed: boolean; // water / starch / detergent screen
  passed: boolean;      // overall batch verdict
};

export type QualitySummary = {
  tests: QualityTest[];
  total: number;
  avgFat: number;
  avgSnf: number;
  passRate: number;        // 0..100, share of batches that passed overall
  cleanStreak: number;     // consecutive most-recent batches with a clean adulteration screen
};

const TABLE = 'quality_tests';

// Cooperative federation member unions (real-sounding UP district unions) and
// the plant that processes each. Kept generic and truthful, no invented people.
const SEED: Array<Pick<QualityTest, 'batch_code' | 'union_name' | 'plant' | 'fat' | 'snf' | 'temperature_c' | 'adulteration_passed' | 'passed'> & { daysAgo: number }> = [
  { batch_code: 'PRG-LKO-4821', union_name: 'Lucknow Dugdh Utpadak Sangh', plant: 'Lucknow Dairy Plant', fat: 4.2, snf: 8.7, temperature_c: 3.4, adulteration_passed: true, passed: true, daysAgo: 0 },
  { batch_code: 'PRG-KNP-3390', union_name: 'Kanpur Dugdh Utpadak Sangh', plant: 'Kanpur Dairy Plant', fat: 4.0, snf: 8.6, temperature_c: 3.8, adulteration_passed: true, passed: true, daysAgo: 1 },
  { batch_code: 'PRG-VNS-1177', union_name: 'Varanasi Dugdh Utpadak Sangh', plant: 'Ramnagar Dairy Plant', fat: 4.4, snf: 8.9, temperature_c: 3.1, adulteration_passed: true, passed: true, daysAgo: 2 },
  { batch_code: 'PRG-GND-2056', union_name: 'Gonda Dugdh Utpadak Sangh', plant: 'Gonda Chilling Centre', fat: 3.9, snf: 8.5, temperature_c: 4.0, adulteration_passed: true, passed: true, daysAgo: 3 },
  { batch_code: 'PRG-LKO-4790', union_name: 'Lucknow Dugdh Utpadak Sangh', plant: 'Lucknow Dairy Plant', fat: 4.1, snf: 8.6, temperature_c: 3.6, adulteration_passed: true, passed: true, daysAgo: 4 },
  { batch_code: 'PRG-KNP-3341', union_name: 'Kanpur Dugdh Utpadak Sangh', plant: 'Kanpur Dairy Plant', fat: 4.3, snf: 8.8, temperature_c: 3.3, adulteration_passed: true, passed: true, daysAgo: 5 },
  { batch_code: 'PRG-VNS-1122', union_name: 'Varanasi Dugdh Utpadak Sangh', plant: 'Ramnagar Dairy Plant', fat: 4.0, snf: 8.5, temperature_c: 4.2, adulteration_passed: true, passed: true, daysAgo: 6 },
];

function buildSeed(): QualityTest[] {
  const now = Date.now();
  return SEED.map((s, i) => {
    const { daysAgo, ...rest } = s;
    return {
      id: `qt_seed_${i}`,
      tested_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      ...rest,
    };
  });
}

/** Recent quality tests, most recent first. Seeds demo data on first read. */
export async function getQualityTests(): Promise<QualityTest[]> {
  const uid = await requireUserId();

  if (isBackendConfigured()) {
    // TODO(api): const { data } = await api.get<QualityTest[]>('/quality/tests');
    // return data; -- until the endpoint exists, fall through to the local seed.
  }

  let rows = await getRows<QualityTest>(TABLE, uid);
  if (rows.length === 0) {
    rows = buildSeed();
    await setRows<QualityTest>(TABLE, uid, rows);
  }
  return rows.slice().sort((a, b) => b.tested_at.localeCompare(a.tested_at));
}

/** Rolls the recent tests up into the dashboard headline figures. */
export async function getQualitySummary(): Promise<QualitySummary> {
  const tests = await getQualityTests();
  const total = tests.length;

  const avg = (pick: (t: QualityTest) => number) =>
    total === 0 ? 0 : tests.reduce((sum, t) => sum + pick(t), 0) / total;

  const passRate = total === 0 ? 0 : Math.round((tests.filter((t) => t.passed).length / total) * 100);

  // Streak of the most-recent consecutive batches with a clean adulteration screen.
  let cleanStreak = 0;
  for (const t of tests) {
    if (t.adulteration_passed) cleanStreak++;
    else break;
  }

  return {
    tests,
    total,
    avgFat: Math.round(avg((t) => t.fat) * 10) / 10,
    avgSnf: Math.round(avg((t) => t.snf) * 10) / 10,
    passRate,
    cleanStreak,
  };
}
