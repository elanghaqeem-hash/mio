const normalizeSha = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const normalizeText = (value) => typeof value === 'string' ? value.trim() : '';

export const evaluatePromotionReadiness = ({ health, deployedManifest, expectedManifest, rootHeaders = {}, now = new Date() }) => {
  const blockers = [];
  const warnings = [];

  if (health?.status !== 'ready') blockers.push('DEPLOYMENT_NOT_READY');

  const expectedSha = normalizeSha(expectedManifest?.gitSha);
  const deployedSha = normalizeSha(deployedManifest?.gitSha);
  const healthSha = normalizeSha(health?.sha);
  if (!expectedSha || !deployedSha || !healthSha) blockers.push('RELEASE_SHA_MISSING');
  if (expectedSha && deployedSha && expectedSha !== deployedSha) blockers.push('MANIFEST_SHA_MISMATCH');
  if (deployedSha && healthSha && deployedSha !== healthSha) blockers.push('HEALTH_SHA_MISMATCH');

  const expectedVersion = normalizeText(expectedManifest?.version);
  const deployedVersion = normalizeText(deployedManifest?.version);
  const healthVersion = normalizeText(health?.version);
  if (!expectedVersion || !deployedVersion || !healthVersion) blockers.push('RELEASE_VERSION_MISSING');
  if (expectedVersion && deployedVersion && expectedVersion !== deployedVersion) blockers.push('MANIFEST_VERSION_MISMATCH');
  if (deployedVersion && healthVersion && deployedVersion !== healthVersion) blockers.push('HEALTH_VERSION_MISMATCH');

  const expectedChannel = normalizeText(expectedManifest?.channel);
  const deployedChannel = normalizeText(deployedManifest?.channel);
  const healthChannel = normalizeText(health?.channel);
  if (!expectedChannel || !deployedChannel || !healthChannel) blockers.push('RELEASE_CHANNEL_MISSING');
  if (expectedChannel && deployedChannel && expectedChannel !== deployedChannel) blockers.push('MANIFEST_CHANNEL_MISMATCH');
  if (deployedChannel && healthChannel && deployedChannel !== healthChannel) blockers.push('HEALTH_CHANNEL_MISMATCH');

  const manifestHash = normalizeText(deployedManifest?.manifestSha256);
  if (!manifestHash || !/^[a-f0-9]{64}$/i.test(manifestHash)) blockers.push('DEPLOYED_MANIFEST_FINGERPRINT_INVALID');

  if (rootHeaders['x-content-type-options'] !== 'nosniff') blockers.push('NOSNIFF_HEADER_MISSING');
  if (rootHeaders['x-frame-options'] !== 'DENY') blockers.push('FRAME_DENY_HEADER_MISSING');

  const generatedAt = Date.parse(deployedManifest?.generatedAt ?? '');
  if (!Number.isFinite(generatedAt)) {
    warnings.push('MANIFEST_TIMESTAMP_INVALID');
  } else {
    const ageHours = Math.max(0, (now.getTime() - generatedAt) / 3_600_000);
    if (ageHours > 72) warnings.push('MANIFEST_OLDER_THAN_72_HOURS');
  }

  if (deployedManifest?.authorityDisclosure?.includes('does not authorize deployment') !== true) {
    warnings.push('AUTHORITY_DISCLOSURE_MISSING');
  }

  return {
    status: blockers.length === 0 ? 'READY' : 'NOT_READY',
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    compared: {
      sha: expectedSha || null,
      version: expectedVersion || null,
      channel: expectedChannel || null,
    },
    authorityDisclosure: 'Read-only promotion assessment. READY is not authorization to deploy, merge, publish, roll back, or modify infrastructure.',
  };
};
