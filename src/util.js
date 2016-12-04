import URL from 'url';
import { servicesWithOptions } from '@gasbuddy/configured-swagger-client';

/**
 * Swagger client returns a wrapped error. Unwrap it.
 * Also avoids non-serializable errors.
 */
export function winstonError(error) {
  let message = error.message;
  let stack = error.stack;
  if (error.errObj) {
    message = error.statusText || error.errObj.message;
    stack = error.errObj.stack;
  }
  return {
    message,
    stack,
  };
}

/**
 * Add a request interceptor to outbound swagger that carries the
 * correlationId forward, optionally using a global proxy as well
 */
export function serviceProxy(req, propName, proxy) {
  if (!req[propName] || !req[propName].services) {
    return null;
  }

  return servicesWithOptions(req[propName].services, {
    requestInterceptor() {
      this.headers.CorrelationId = this.headers.CorrelationId || req.headers.CorrelationId;
      if (proxy) {
        const { protocol, path: pathAndQuery, hostname, port } = URL.parse(this.url);
        if (!hostname.includes('.')) {
          this.headers.Port = port;
          this.headers.Host = hostname;
          this.headers.Protocol = protocol.replace(/:$/, '');
          this.url = `http://${proxy}${pathAndQuery}`;
        }
      }
    },
  });
}
