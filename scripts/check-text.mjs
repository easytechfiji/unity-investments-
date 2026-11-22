// House style check (brief, Part 1 rule 5): no em dashes, en dashes used as
// dashes, or emojis in any tracked text file. Run with `npm run check:text`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEXT_EXTENSIONS =
  /\.(ts|tsx|js|mjs|cjs|json|md|css|html|sql|yml|yaml|txt|toml|example)$|(^|\/)\.[a-z]+rc$/;

// The brief itself quotes the banned characters, so it is skipped.
const SKIP = new Set(['CLAUDE.md', 'package-lock.json']);

const BANNED = [
  { name: 'em dash', pattern: /\u2014/u },
  { name: 'en dash', pattern: /\u2013/u },
  { name: 'emoji', pattern: /\p{Extended_Pictographic}/u },
];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file && TEXT_EXTENSIONS.test(file) && !SKIP.has(file));

let problems = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted but not yet staged
  }
  text.split('\n').forEach((line, index) => {
    for (const { name, pattern } of BANNED) {
      if (pattern.test(line)) {
        console.log(`${file}:${index + 1}: ${name}`);
        problems += 1;
      }
    }
  });
}

if (problems > 0) {
  console.log(`\n${problems} problem(s) found.`);
  process.exit(1);
}
console.log(`Checked ${files.length} files. No em dashes, en dashes or emojis.`);
