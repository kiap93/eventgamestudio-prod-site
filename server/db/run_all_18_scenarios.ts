import { execSync } from 'node:child_process';

const testSuites = [
  { name: '1. Event Test Score Flow (Scenarios 1-7)', file: 'server/db/event_test_score_flow.test.ts' },
  { name: '2. Memory Match Server Validation (Scenarios 8-12)', file: 'server/db/memory_match_server_validation.test.ts' },
  { name: '3. Idempotency & Concurrency (Scenarios 13-14)', file: 'server/db/idempotency_concurrency.test.ts' },
  { name: '4. Result Screen Coordinates (Scenarios 15-16)', file: 'server/db/result_screen_coordinates.test.ts' },
  { name: '5. Migration Integrity & History (Scenarios 17-18)', file: 'server/db/migration_integrity.test.ts' },
];

console.log('================================================================');
console.log('🚀 RUNNING COMPREHENSIVE VERIFICATION FOR ALL 18 SCENARIOS');
console.log('================================================================\n');

let allPassed = true;

for (const suite of testSuites) {
  console.log(`\n▶️ Executing: ${suite.name}`);
  try {
    const output = execSync(`npx tsx ${suite.file}`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    console.log(output);
  } catch (err: any) {
    console.error(`❌ Suite Failed: ${suite.name}`);
    console.error(err.stdout || err.stderr || err.message);
    allPassed = false;
    break;
  }
}

if (allPassed) {
  console.log('================================================================');
  console.log('✅ ALL 18 TEST SCENARIOS VERIFIED AND PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
} else {
  console.error('❌ One or more test suites failed.');
  process.exit(1);
}
