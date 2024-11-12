import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
  context,
  SpanContext,
} from '@opentelemetry/api';
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
diag.setLogger(new DiagConsoleLogger(), {
  suppressOverrideMessage: true,
  logLevel: DiagLogLevel.INFO,
});

function getExporter() {
  if (['production', 'staging'].includes(process.env.APP_ENV || process.env.NODE_ENV || '')) {
    return new OTLPTraceExporter({
      url: process.env.OTLP_EXPORTER || 'http://otlp-exporter:4318/v1/traces',
    });
  }
  return new opentelemetry.tracing.ConsoleSpanExporter();
}

async function startTelemetry(options: DelayLoadServiceStartOptions) {
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
            // eslint-disable-next-line no-param-reassign
            additionalHeaders.correlationid = ctx.traceId;
            // eslint-disable-next-line no-param-reassign
            additionalHeaders.span = ctx.spanId;
          }
        },
      },
    })],
  });
  await sdk.start();
  return sdk;
}

let telemetry: opentelemetry.NodeSDK;

export async function startWithTelemetry<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
>(options: DelayLoadServiceStartOptions) {
  if (!telemetry) {
    telemetry = await startTelemetry(options);
  }

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
    await telemetry.shutdown();
    app.locals.logger.info('OpenTelemetry shut down');
  });
  return { app, server };
}

export function currentTelemetryInfo(): SpanContext | undefined {
  const currentSpan = trace.getSpan(context.active());
  return currentSpan?.spanContext();
}
