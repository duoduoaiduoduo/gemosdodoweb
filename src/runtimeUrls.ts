const localDevHosts = new Set(['localhost', '127.0.0.1']);

const isAbsoluteHttpUrl = (value: string) => /^https?:\/\//i.test(value);

export const resolveRuntimeContentUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (typeof window === 'undefined') return raw;
  if (isAbsoluteHttpUrl(raw)) return raw;

  const {protocol, hostname, port, origin} = window.location;
  const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
  const shouldUseBackendOrigin =
    localDevHosts.has(hostname) &&
    (port === '3000' || port === '5173') &&
    normalizedPath.startsWith('/uploads/');

  if (shouldUseBackendOrigin) {
    return `${protocol}//${hostname}:3001${normalizedPath}`;
  }

  return normalizedPath.startsWith('/') ? `${origin}${normalizedPath}` : raw;
};
