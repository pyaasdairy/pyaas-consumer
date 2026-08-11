import { getUserId } from './session';
import { getRows, setRows } from './localStore';
import { isBackendConfigured } from './apiClient';

/**
 * PYAAS quality data (local-first). PYAAS sources from a multi-dairy cooperative
 * federation, so quality is honest and batch-level: every pack traces to a
 * member district dairy union + its plant and the lab tests that batch passed
 * (FAT, SNF, temperature and an adulteration screen for water/starch/detergent).
 *
 * NOTHING IN HERE IS INVENTED, and nothing may be. Earlier builds seeded a week
 * of realistic FAT/SNF, cold-chain and adulteration-screen results dated against
 * today and attributed to REAL named cooperative unions (Lucknow / Kanpur /
 * Varanasi Dugdh Utpadak Sangh, Ramnagar Dairy Plant) so the dashboard "looked
 * alive". Those were lab records we never took, about food we sell, naming
 * organisations that never signed off on them — a false representation about an
 * article of food under FSS Act 2006 s.53 and a misleading advertisement under
 * Consumer Protection Act 2019 s.89, and the fabricated-content case App Review
 * rejects under Guideline 2.3.1. Deleted. Until the API serves real records the
 * dashboard shows its empty state, which is the truth.
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

/**
 * Dev-only sample rows so the dashboard is workable while GET /quality/tests is
 * unbuilt. __DEV__ is compiled out of any release bundle, so this cannot reach a
 * store build regardless of env. The union and plant are deliberately fictional
 * and self-labelling: no real cooperative may ever appear beside a lab result it
 * did not produce, not even in a screenshot someone takes off a dev build.
 * Never persisted — it stays in memory so it cannot outlive the dev session.
 */
function devDemoTests(): QualityTest[] {
  if (!__DEV__) return [];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    { fat: 4.2, snf: 8.7, temperature_c: 3.4 },
    { fat: 4.0, snf: 8.6, temperature_c: 3.8 },
    { fat: 3.9, snf: 8.5, temperature_c: 4.0 },
  ].map((s, i) => ({
    id: `qt_demo_${i}`,
    batch_code: `SAMPLE-000${i + 1}`,
    union_name: 'Sample Dairy Union (dev data)',
    plant: 'Sample Chilling Centre',
    tested_at: new Date(now - i * day).toISOString(),
    adulteration_passed: true,
    passed: true,
    ...s,
  }));
}

/**
 * Recent quality tests, most recent first. Empty until real lab records exist —
 * callers render their empty state rather than anything invented.
 */
export async function getQualityTests(): Promise<QualityTest[]> {
  // A read must never throw just because nobody is signed in; the dashboard is
  // reachable before the profile gate on a cold start.
  const uid = await getUserId();
  if (!uid) return devDemoTests();

  if (isBackendConfigured()) {
    // TODO(api): const { data } = await api.get<QualityTest[]>('/quality/tests');
    // return data; -- until the endpoint exists there is nothing honest to show.
  }

  const rows = await getRows<QualityTest>(TABLE, uid);
  // Installs that ran a build with the fabricated seed still carry those rows in
  // AsyncStorage, so deleting the constant alone would leave the invented
  // results on screen forever. Purge them on first read.
  const clean = rows.filter((t) => !t.id.startsWith('qt_seed_'));
  if (clean.length !== rows.length) await setRows<QualityTest>(TABLE, uid, clean);

  const tests = clean.length ? clean : devDemoTests();
  return tests.slice().sort((a, b) => b.tested_at.localeCompare(a.tested_at));
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
