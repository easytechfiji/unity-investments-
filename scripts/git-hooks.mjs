// Runs on `npm install` (the root "prepare" script). Points git at the hooks in .githooks.
// Build servers such as Vercel may install without a git checkout, so a failure here is skipped
// instead of failing the install.
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  process.stdout.write('No git checkout here, skipping the git hooks setup.\n');
}
