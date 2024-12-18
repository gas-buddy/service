import { URL } from 'node:url';
import crypto from 'node:crypto';
import type { FetchConfig, FetchRequest, RestApiResponse } from 'rest-api-support';
import EventSource from 'eventsource';
import { ServiceError, ServiceErrorSpec } from '../error';

import type {
  ServiceExpress,
  ServiceLike,
  ServiceLocals,
} from '../types';
import type { ServiceConfiguration } from '../config/schema';
import { currentTelemetryInfo } from '../telemetry';

class CustomEventSource extends EventSource {
  private activeListeners: Array<{ handler: (data: any) => void; name: string }> = [];

  addEventListener(name: string, handler: (data: any) => void): this {
    super.addEventListener(name, handler);
    this.activeListeners.push({ name, handler });
    return this;
  }

  removeAllListeners() {
    this.activeListeners.forEach((l) => {
      super.removeEventListener(l.name as keyof EventSourceEventMap, l.handler);
    });
  }
}

/**
 * Return a factory that will make instances of an OpenAPI/Swagger client for each request
 */
export function createServiceInterface<ServiceType>(
  service: ServiceExpress,
  name: string,
  Implementation: { new (c: FetchConfig): ServiceType },
): ServiceType {
  const appConfig = service.locals.config;
  const config = {
    ...(appConfig.get('connections:default') || {}),
    ...(appConfig.get(`connections:${name}`) || {}),
  } as ServiceConfiguration;
  const protocol = config?.protocol || 'http';
  const port = config?.port || 8000;
  const host = config?.host || name;
  const baseUrl = `${protocol}${protocol.endsWith(':') ? '//' : '://'}${host}:${port}${
    config?.basePath || ''
  }`;

  const fetchConfig: FetchConfig = {
    fetch,
    AbortController,
    EventSource: CustomEventSource,
    FormData,
    baseUrl,
  };

  // In development, it can be useful to route requests through
  // a centralized local proxy (we use https://github.com/gas-buddy/container-proxy).
  // This allows you to run a subset of services locally and route the rest
  // of the requests to another (typically remote) environment.
  if (config?.proxy) {
    const proxyUrl = new URL(config.proxy);
    const proxyPort = proxyUrl.protocol === 'https:' ? '8443' : '8000';

    fetchConfig.requestInterceptor = (params: FetchRequest) => {
      /* eslint-disable no-param-reassign */
      const parsedUrl = new URL(params.url);
      const proto = parsedUrl.protocol.replace(/:$/, '');
      const defaultPort = proto === 'https' ? 8443 : 8000;
      const headers: FetchRequest['headers'] = {
        correlationid: params.headers?.correlationid
          || currentTelemetryInfo()?.traceId
          || service.locals.traceId
          || crypto.randomBytes(16).toString('hex'),
      };
      headers.host = `${proto}.${parsedUrl.hostname}.${port || defaultPort}`;
      headers.source = service.locals.name;
      parsedUrl.hostname = proxyUrl.hostname;
      parsedUrl.protocol = proxyUrl.protocol;
      parsedUrl.port = proxyUrl.port || proxyPort;
      // eslint-disable-next-line no-param-reassign
      params.headers = params.headers || {};
      Object.assign(params.headers, headers);
      params.url = parsedUrl.href;
      /* eslint-enable no-param-reassign */
    };
  }

  fetchConfig.requestInterceptor = (params: FetchRequest) => {
    /* eslint-disable no-param-reassign */
    params.headers = params.headers || {};
    const headers: FetchRequest['headers'] = {
      correlationid: params.headers?.correlationid
        || currentTelemetryInfo()?.traceId
        || service.locals.traceId
        || crypto.randomBytes(16).toString('hex'),
    };
    Object.assign(params.headers, headers);
    /* eslint-enable no-param-reassign */
  };

  return new Implementation(fetchConfig);
}

interface SpecWithMessage extends ServiceErrorSpec {
  message?: string;
}

function readResponse<
  SLocals extends ServiceLocals,
  AppType extends ServiceLike<SLocals>,
  ResType extends RestApiResponse<number, any>,
>(
  app: AppType,
  response: ResType,
  errorSpec?: SpecWithMessage,
): Extract<ResType, { responseType: 'response' }> {
  if (response.responseType === 'response') {
    return response as Extract<ResType, { responseType: 'response' }>;
  }
  const { message, ...spec } = errorSpec || {};
  throw new ServiceError(
    app,
    message || response.body.message || 'Internal Error',
    {
      status: response.status,
      ...spec,
    },
  );
}

export async function throwOrGetResponse<
  SLocals extends ServiceLocals,
  AppType extends ServiceLike<SLocals>,
  ResType extends RestApiResponse<number, any>,
>(
  app: AppType,
  exec: () => Promise<ResType>,
  errorSpec?: SpecWithMessage,
): Promise<Extract<ResType, { responseType: 'response' }>> {
  const response = await exec();
  return readResponse(app, response, errorSpec);
}
