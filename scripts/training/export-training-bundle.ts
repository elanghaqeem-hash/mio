import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTrainingBundle, MioTrainingRunConfig } from '../../src/training/TrainingBundle';
import { verifyTrainingBundle } from '../../src/training/TrainingBundleVerifier';
import { MioTrainingExample } from '../../src/training/TrainingDataset';

interface CliArgs {
  examples?: string;
  config?: string;
  output?: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--force') { args.force = true; continue; }
    if (token === '--examples') args.examples = argv[++index];
    else if (token === '--config') args.config = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else if (token === '--help' || token === '-h') return args;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function usage(): string {
  return [
    'MIO governed training bundle exporter',
    '',
    'Usage:',
    '  npm run training:export -- --examples <examples.json> --config <config.json> --output <directory> [--force]',
    '',
    'Input:',
    '  examples.json  JSON array of MioTrainingExample objects',
    '  config.json    MioTrainingRunConfig object',
    '',
    'Output:',
    '  train.jsonl    eligible, approved examples only',
    '  manifest.json  deterministic governance/reproducibility manifest',
    '',
    'The exporter never trains, uploads, promotes, or activates a model.',
  ].join('\n');
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function directoryHasFiles(directory: string): Promise<boolean> {
  try {
    const details = await stat(directory);
    if (!details.isDirectory()) throw new Error(`Output path exists and is not a directory: ${directory}`);
    const { readdir } = await import('node:fs/promises');
    return (await readdir(directory)).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.examples || !args.config || !args.output) {
    console.log(usage());
    process.exitCode = process.argv.some((arg) => arg === '--help' || arg === '-h') ? 0 : 2;
    return;
  }

  const examplesPath = path.resolve(args.examples);
  const configPath = path.resolve(args.config);
  const outputDirectory = path.resolve(args.output);

  if (!args.force && await directoryHasFiles(outputDirectory)) {
    throw new Error(`Refusing to overwrite non-empty output directory without --force: ${outputDirectory}`);
  }

  const examples = await readJson<MioTrainingExample[]>(examplesPath);
  const config = await readJson<MioTrainingRunConfig>(configPath);
  if (!Array.isArray(examples)) throw new Error('Training examples file must contain a JSON array');

  const bundle = await buildTrainingBundle(examples, config);
  const verification = await verifyTrainingBundle(bundle);
  if (!verification.valid) throw new Error(`Generated training bundle failed verification: ${verification.errors.join('; ')}`);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, bundle.manifest.files.trainingData), bundle.trainingJsonl, { encoding: 'utf8', flag: 'w' });
  await writeFile(path.join(outputDirectory, bundle.manifest.files.manifest), `${JSON.stringify(bundle.manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });

  console.log(`MIO TRAINING BUNDLE: CREATED`);
  console.log(`Bundle: ${bundle.manifest.bundleId}`);
  console.log(`Eligible examples: ${bundle.manifest.dataset.exampleCount}`);
  console.log(`Excluded examples: ${bundle.manifest.dataset.excludedCount}`);
  console.log(`Dataset SHA-256: ${bundle.manifest.dataset.sha256}`);
  console.log(`Config SHA-256: ${bundle.manifest.reproducibility.configSha256}`);
  console.log(`Promotion status: ${bundle.manifest.promotionStatus}`);
  console.log(`Output: ${outputDirectory}`);
  console.log('No model training, upload, promotion, or activation was performed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
