import { runMioTraceLedgerTests } from '../src/tests/mioTraceLedgerTests';
const result = runMioTraceLedgerTests();
if (result.passed !== result.total) process.exitCode = 1;
console.log(`MIO trace ledger: ${result.passed}/${result.total}`);
