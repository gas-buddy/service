import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import * as opentelemetry from '@opentelemetry/sdk-node';

import { getAutoInstrumentations } from './instrumentations';

import type {
  DelayLoadServiceStartOptions,
  RequestLocals,
  ServiceLocals,
  ServiceStartOptions,
} from '../types';

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

function getExporter() {
  if (['production', 'staging'].includes(process.env.NODE_ENV || '')) {
    return new OTLPTraceExporter({
      url: process.env.OTLP_EXPORTER || 'http://otlp-exporter:4318/v1/traces',
    });
  }
  return new opentelemetry.tracing.ConsoleSpanExporter();
}

export async function startWithTelemetry<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
>(options: DelayLoadServiceStartOptions) {
  const sdk = new opentelemetry.NodeSDK({
    serviceName: options.name,
    autoDetectResources: true,
    traceExporter: getExporter(),
    instrumentations: [getAutoInstrumentations({
      'opentelemetry-instrumentation-node-18-fetch': {
        onRequest({ request, span, additionalHeaders }) {
          // This particular line is "GasBuddy" specific, in that we have a number
          // of services not yet on OpenTelemetry that look for this header instead.
          // Putting traceId gives us a "shot in heck" of useful searches.
          if (!/^correlationid:/m.test(request.headers)) {
            const ctx = span.spanContext();
            additionalHeaders.correlationid = ctx.traceId;
            additionalHeaders.span = ctx.spanId;
          }
        },
      },
    })],
  });
  await sdk.start();

  const { startApp, listen } = await import('../express-app/app.js');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { default: service } = require(options.service);
  const startOptions: ServiceStartOptions<SLocals> = {
    ...options,
    service,
    locals: { ...options.locals } as Partial<SLocals>,
  };
  const app = await startApp<SLocals, RLocals>(startOptions);
  app.locals.logger.info('OpenTelemetry enabled');

  const server = await listen(app, async () => {
    await sdk.shutdown();
    app.locals.logger.info('OpenTelemetry shut down');
  });
  return { app, server };
}
