import diagch from 'node:diagnostics_channel';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { InstrumentationBase, InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  Attributes,
  context,
  propagation,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

interface ListenerRecord {
  name: string;
  channel: diagch.Channel;
  onMessage: diagch.ChannelListener;
}

interface FetchInstrumentationConfig extends InstrumentationConfig {
  onRequest?: (args: { request: any; span: Span; additionalHeaders: Record<string, any>; }) => void;
}

// Get the content-length from undici response headers.
// `headers` is an Array of buffers: [k, v, k, v, ...].
// If the header is not present, or has an invalid value, this returns null.
function contentLengthFromResponseHeaders(headers: Buffer[]) {
  const name = 'content-length';
  for (let i = 0; i < headers.length; i += 2) {
    const k = headers[i];
    if (k.length === name.length && k.toString().toLowerCase() === name) {
      const v = Number(headers[i + 1]);
      if (!Number.isNaN(Number(v))) {
        return v;
      }
      return undefined;
    }
  }
  return undefined;
}

// A combination of https://github.com/elastic/apm-agent-nodejs and
// https://github.com/gadget-inc/opentelemetry-instrumentations/blob/main/packages/opentelemetry-instrumentation-undici/src/index.ts
export class FetchInstrumentation extends InstrumentationBase {
  // Keep ref to avoid https://github.com/nodejs/node/issues/42170 bug and for
  // unsubscribing.
  private channelSubs: Array<ListenerRecord> | undefined;

  private spanFromReq = new WeakMap<any, Span>();

  private requestHook: FetchInstrumentationConfig['onRequest'];

  private subscribeToChannel(diagnosticChannel: string, onMessage: diagch.ChannelListener) {
    const channel = diagch.channel(diagnosticChannel);
    channel.subscribe(onMessage);
    this.channelSubs!.push({
      name: diagnosticChannel,
      channel,
      onMessage,
    });
  }

  protected init() {
    // Force load fetch API (since it's lazy loaded in Node 18)
    fetch('').catch(() => {});

    this.channelSubs = [];
    this.subscribeToChannel('undici:request:create', (args) => this.onRequest(args));
    this.subscribeToChannel('undici:request:headers', (args) => this.onHeaders(args));
    this.subscribeToChannel('undici:request:trailers', (args) => this.onDone(args));
    this.subscribeToChannel('undici:request:error', (args) => this.onError(args));
    // We don't need to monkey patch anything. We're cool like that.
    return [];
  }

  constructor(config: FetchInstrumentationConfig) {
    super('opentelemetry-instrumentation-node-18-fetch', '1.0.0', config);
    this.requestHook = config.onRequest;
  }

  onRequest({ request }: any): void {
    // We do not handle instrumenting HTTP CONNECT. See limitation notes above.
    if (request.method === 'CONNECT') {
      return;
    }
    const span = this.tracer.startSpan(`HTTP ${request.method}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        [SemanticAttributes.HTTP_URL]: String(request.origin),
        [SemanticAttributes.HTTP_METHOD]: request.method,
        [SemanticAttributes.HTTP_TARGET]: request.path,
        'http.client': 'fetch',
      },
    });
    const requestContext = trace.setSpan(context.active(), span);
    const addedHeaders: Record<string, string> = {};
    propagation.inject(requestContext, addedHeaders);

    if (this.requestHook) {
      this.requestHook({ request, span, additionalHeaders: addedHeaders });
    }

    request.headers += Object.entries(addedHeaders)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join('');
    this.spanFromReq.set(request, span);
  }

  onHeaders({ request, response }: any): void {
    const span = this.spanFromReq.get(request);

    if (span !== undefined) {
      // We are currently *not* capturing response headers, even though the
      // intake API does allow it, because none of the other `setHttpContext`
      // uses currently do.

      const cLen = contentLengthFromResponseHeaders(response.headers);
      const attrs: Attributes = {
        [SemanticAttributes.HTTP_STATUS_CODE]: response.statusCode,
      };
      if (cLen) {
        attrs[SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH] = cLen;
      }
      span.setAttributes(attrs);
      span.setStatus({
        code: response.statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
        message: String(response.statusCode),
      });
    }
  }

  onDone({ request }: any): void {
    const span = this.spanFromReq.get(request);
    if (span !== undefined) {
      span.end();
      this.spanFromReq.delete(request);
    }
  }

  onError({ request, error }: any): void {
    const span = this.spanFromReq.get(request);
    if (span !== undefined) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();
    }
  }
}
