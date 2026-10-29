// Tests this branch's approved JSON against an existing KPI implementation,
// without switching branches, merging code, or modifying the source ref.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const ref = process.argv[2] ?? '49797865ac3900834846cc4aaf8ec467cd2a2053';
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs');
if (!existsSync(vitest)) throw new Error('Vitest is not installed. Use the integration branch toolchain or install its pinned dev dependencies before running this cross-branch test.');
const sha = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
const temp = mkdtempSync(path.join(tmpdir(), 'gl03-kpi-'));
try {
  for (const file of ['lib/kpi/calculate.ts', 'lib/kpi/ingest.ts', 'schemas/metrics.ts', 'tests/kpi/calculate.test.ts', 'tests/kpi/ingest.test.ts', 'tests/kpi/fixtures.ts']) {
    const target = path.join(temp, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, execFileSync('git', ['show', `${sha}:${file}`], { cwd: root }));
  }
  symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
  const config = path.join(temp, 'vitest.config.mjs');
  writeFileSync(config, `export default ${JSON.stringify({ root, resolve: { alias: { '@': temp } }, test: { include: [path.join(root, 'tests/kpi/gl-03-fixture.test.ts'), path.join(temp, 'tests/kpi/calculate.test.ts'), path.join(temp, 'tests/kpi/ingest.test.ts')] } })};\n`);
  console.log(`Testing approved GL-03 files against read-only KPI source ${sha}. Simulated, pre-authored data only.`);
  const result = spawnSync(process.execPath, [vitest, 'run', '--config', config, '--maxWorkers=1'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(temp, { recursive: true, force: true }); }
