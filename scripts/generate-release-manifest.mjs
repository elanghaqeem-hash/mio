import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const generatedAt = new Date().toISOString();
const gitSha = process.env.GITHUB_SHA || process.env.MIO_BUILD_SHA || 'LOCAL_UNSPECIFIED';
const channel = process.env.MIO_RELEASE_CHANNEL || 'technology-preview';

const collectFiles = async (root, prefix = '') => {
  const entries = await readdir(root, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      output.push(...await collectFiles(absolute, relative));
    } else if (entry.isFile()) {
      const bytes = await readFile(absolute);
      output.push({
        path: relative,
        bytes: (await stat(absolute)).size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
  return output;
};

const webFiles = await collectFiles('dist');
const electronFiles = await collectFiles('dist-electron');
const payload = {
  schemaVersion: 1,
  product: pkg.build?.productName ?? pkg.name,
  packageName: pkg.name,
  version: pkg.version,
  channel,
  gitSha,
  generatedAt,
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  authorityDisclosure: 'Build metadata only. This manifest does not authorize deployment, system access, tool execution, memory mutation, or privileged operations.',
  artifacts: {
    web: webFiles,
    electron: electronFiles,
  },
};

const canonical = JSON.stringify(payload, null, 2);
const manifestHash = createHash('sha256').update(canonical).digest('hex');
const manifest = { ...payload, manifestSha256: manifestHash };

await writeFile('dist/release-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log('MIO RELEASE MANIFEST: CREATED');
console.log(`SHA: ${gitSha}`);
console.log(`Channel: ${channel}`);
console.log(`Web files: ${webFiles.length}`);
console.log(`Electron files: ${electronFiles.length}`);
console.log(`Manifest SHA-256: ${manifestHash}`);
