import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([".git", ".next", "node_modules", "coverage", "test-results", "playwright-report"]);

const mojibakePatterns = [
  { label: "mojibake C3", value: String.fromCharCode(0x00c3) },
  { label: "mojibake C2", value: String.fromCharCode(0x00c2) },
  { label: "replacement triplet", value: String.fromCharCode(0x00ef, 0x00bf, 0x00bd) },
  { label: "replacement char", value: String.fromCharCode(0xfffd) },
];

const suspiciousQuestionPatterns = [
  { label: "bad vision word", regex: /Vis\?o/u },
  { label: "bad month word", regex: /m\?s/u },
  { label: "bad card word", regex: /cart\?(?:o|es)/u },
  { label: "bad pending word", regex: /pend\?ncias/u },
  { label: "separator question mark", regex: /\s\?\s(?:Este|valores|falta)/u },
];

function collectFiles(entry, files = []) {
  if (!existsSync(entry)) {
    return files;
  }

  const stats = statSync(entry);

  if (stats.isDirectory()) {
    for (const child of readdirSync(entry)) {
      if (ignoredDirectories.has(child)) {
        continue;
      }

      collectFiles(join(entry, child), files);
    }

    return files;
  }

  if (stats.isFile() && extensions.has(extname(entry))) {
    files.push(entry);
  }

  return files;
}

const files = [
  ...collectFiles("src"),
  ...collectFiles("scripts"),
  "prisma/seed.ts",
].filter((file, index, allFiles) => existsSync(file) && allFiles.indexOf(file) === index);

const findings = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of mojibakePatterns) {
      if (line.includes(pattern.value)) {
        findings.push({ file, line: index + 1, label: pattern.label });
      }
    }

    for (const pattern of suspiciousQuestionPatterns) {
      if (pattern.regex.test(line)) {
        findings.push({ file, line: index + 1, label: pattern.label });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Encoding check failed. Suspicious text was found:");

  for (const finding of findings) {
    console.error(`- ${relative(process.cwd(), finding.file)}:${finding.line} (${finding.label})`);
  }

  process.exit(1);
}

console.log(`Encoding check passed for ${files.length} files.`);
