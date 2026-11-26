// Scans the PRODUCTION BUILD (.next) for patterns the minifier has corrupted.
//
//   npm run build && npm run check:build
//
// Why this exists: Next 14.2.5's minifier can fold a template string that
// builds a regular expression into a plain string literal and, on the way,
// write its word-boundary mark "\\b" as "\\\b" — a backslash followed by a
// BACKSPACE character. The pattern then matches nothing, in the built server
// code only: `next dev`, the unit tests and the browser bundle keep working.
// That is how holiday pickup days were silently broken on the live site from
// Nov 24 to Nov 25 2026 (see the note at the top of the patterns in
// lib/availability.ts).
//
// The app's own code no longer builds patterns from strings at all (a unit
// test enforces that), so today this finds nothing. It is here for the day a
// dependency or a new file reintroduces the shape: a string handed to
// RegExp(...) in which an escape letter is preceded by an ODD run of three or
// more backslashes. "\\b" (two) is a correct word boundary; "\\\b" (three) is
// a literal backslash plus a control character, which no pattern means.
//
// Exit code 1 when anything is found, 0 otherwise (also 0, with a note, when
// there is no build to scan).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), ".next");
const DIRS = [join(ROOT, "server"), join(ROOT, "static")];

function* jsFiles(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* jsFiles(path);
    else if (name.endsWith(".js")) yield path;
  }
}

// A string argument to RegExp(...) or new RegExp(...): "…", '…' or `…`.
const REGEXP_STRING = /RegExp\(\s*(["'`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
// An odd run of 3+ backslashes right before a letter that forms a control
// character escape in a string (\b backspace, \f form feed, \v vertical tab).
// "\\b" has two backslashes and is fine. \n, \r and \t are left out: an odd
// run before them is just as wrong, but they also turn up in ordinary text.
const CORRUPTED = /(?<!\\)(?:\\\\)+\\[bfv]/g;

if (!existsSync(ROOT)) {
  console.log("check-build: no .next folder here — run `npm run build` first. Nothing scanned.");
  process.exit(0);
}

let scanned = 0;
const findings = [];
for (const dir of DIRS) {
  for (const file of jsFiles(dir)) {
    scanned++;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(REGEXP_STRING)) {
      const bad = m[2].match(CORRUPTED);
      if (!bad) continue;
      findings.push({
        file: file.replace(process.cwd() + "/", ""),
        count: bad.length,
        sample: m[0].slice(0, 140),
      });
    }
  }
}

if (findings.length === 0) {
  console.log(`check-build: OK — ${scanned} built files scanned, no corrupted pattern found.`);
  process.exit(0);
}
console.error(
  `check-build: FOUND ${findings.length} corrupted pattern(s) in the production build.\n` +
    "A pattern built from a string lost its word-boundary marks when the build minified it,\n" +
    "so it can never match on the live site. Write that pattern as a regex literal (/…/)\n" +
    "instead of new RegExp(`…`). See the note in lib/availability.ts.\n"
);
for (const f of findings) {
  console.error(`  ${f.file}  (${f.count} broken mark${f.count === 1 ? "" : "s"})`);
  console.error(`    ${f.sample}${f.sample.length >= 140 ? "…" : ""}`);
}
process.exit(1);
