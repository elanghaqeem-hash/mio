import fs from 'node:fs';
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('Usage: node local-ai-remediation-report.mjs before.json after.json');
  process.exit(2);
}
function read(path) {
  try {
    const report = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (!report?.metadata?.vulnerabilities) throw new Error('missing npm audit metadata');
    return report;
  } catch (error) {
    console.error('Invalid npm audit report:', String(error));
    process.exit(2);
  }
}
const before = read(beforePath), after = read(afterPath);
const levels = ['critical', 'high', 'moderate', 'low', 'info'];
const summary = Object.fromEntries(levels.map(level => [level, { before: before.metadata.vulnerabilities[level] ?? 0, after: after.metadata.vulnerabilities[level] ?? 0 }]));
const remaining = Object.entries(after.vulnerabilities || {}).map(([name, finding]) => ({
  name, severity: finding.severity, direct: finding.isDirect, fixAvailable: finding.fixAvailable,
})).sort((a,b) => levels.indexOf(a.severity)-levels.indexOf(b.severity));
console.log(JSON.stringify({ summary, remaining, autoMergeAllowed: false, note: 'Candidate must be reviewed; real desktop packaging and security acceptance are still required.' }, null, 2));
