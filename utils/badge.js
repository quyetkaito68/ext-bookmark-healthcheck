export function badgeInfo(code) {
  if (code === 0)                        return { cls: 'badge-network', label: '0 – Lỗi mạng' };
  if (code >= 300 && code < 400)         return { cls: 'badge-3xx',    label: String(code) };
  if (code >= 400 && code < 500)         return { cls: 'badge-4xx',    label: String(code) };
  if (code >= 500)                       return { cls: 'badge-5xx',    label: String(code) };
  return                                        { cls: 'badge-network', label: String(code) };
}

export function codeLabel(code) {
  const MAP = {
    0: '0 – Lỗi mạng / Timeout',
    301: '301 – Chuyển hướng vĩnh viễn',
    302: '302 – Chuyển hướng tạm thời',
    400: '400 – Bad Request',
    401: '401 – Unauthorized',
    403: '403 – Forbidden',
    404: '404 – Not Found',
    405: '405 – Method Not Allowed',
    410: '410 – Gone',
    429: '429 – Too Many Requests',
    500: '500 – Internal Server Error',
    502: '502 – Bad Gateway',
    503: '503 – Service Unavailable',
    504: '504 – Gateway Timeout',
  };
  return MAP[code] || String(code);
}
