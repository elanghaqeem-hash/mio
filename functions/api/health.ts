interface Env {
  MIO_RELEASE_VERSION?: string;
  MIO_RELEASE_CHANNEL?: string;
  MIO_RELEASE_SHA?: string;
  MIO_DEPLOYMENT_ID?: string;
}

interface PagesContext {
  env: Env;
}

const safe = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
};

const response = (context: PagesContext) =>
  new Response(
    JSON.stringify({
      service: 'mio-web-lab',
      status: 'ready',
      release: {
        version: safe(context.env.MIO_RELEASE_VERSION, '1.0.0'),
        channel: safe(context.env.MIO_RELEASE_CHANNEL, 'technology-preview'),
        commitSha: safe(context.env.MIO_RELEASE_SHA, 'unknown'),
        deploymentId: safe(context.env.MIO_DEPLOYMENT_ID, 'unknown'),
      },
      authority: 'readiness metadata only; no secret, deployment, execution, or health-of-external-provider claim',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );

export function onRequestGet(context: PagesContext): Response {
  return response(context);
}

export function onRequestHead(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
