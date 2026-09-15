export type MioReleaseChannel = 'technology-preview' | 'release-candidate' | 'development';

const normalize = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
};

const normalizeChannel = (value: string | undefined): MioReleaseChannel => {
  if (value === 'technology-preview' || value === 'release-candidate' || value === 'development') return value;
  return 'development';
};

export const releaseMetadata = Object.freeze({
  version: normalize(import.meta.env.VITE_MIO_RELEASE_VERSION, '1.0.0'),
  channel: normalizeChannel(import.meta.env.VITE_MIO_RELEASE_CHANNEL),
  commitSha: normalize(import.meta.env.VITE_MIO_RELEASE_SHA, 'local'),
  runtime: typeof window !== 'undefined' && window.mioDesktop ? 'desktop' : 'web',
  deploymentId: normalize(import.meta.env.VITE_MIO_DEPLOYMENT_ID, 'local'),
});

export const shortReleaseSha = (releaseMetadata.commitSha === 'local' ? 'local' : releaseMetadata.commitSha.slice(0, 8));
