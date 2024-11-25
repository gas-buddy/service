import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
  context,
  SpanContext,
} from '@opentelemetry/api';
import {
  detectResourcesSync,
  envDetectorSync,
  hostDetectorSync,
  processDetectorSync,
  Resource,
} from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import * as opentelemetry from '@opentelemetry/sdk-node';

import { getAutoInstrumentations } from './instrumentations';

import type {
  DelayLoadServiceStartOptions,
  RequestLocals,
  ServiceLocals,
  ServiceStartOptions,
} from '../types';

async function getTelemetryResources(): Promise<Resource> {
  const attributes = detectResourcesSync({
    detectors: [
      envDetectorSync,
      hostDetectorSync,
      processDetectorSync,
    ],
  });
  return attributes;
}

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

let telemetry: opentelemetry.NodeSDK | undefined;

async function startTelemetry(serviceName: string) {
  if (!telemetry) {
    telemetry = new opentelemetry.NodeSDK({
      serviceName,
      autoDetectResources: false,
      resource: await getTelemetryResources(),
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
    await telemetry.start();
  }
}

export async function startWithTelemetry<
  SLocals extends ServiceLocals = ServiceLocals,
  RLocals extends RequestLocals = RequestLocals,
>(options: DelayLoadServiceStartOptions) {
  await startTelemetry(options.name);

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
    await telemetry?.shutdown();
    app.locals.logger.info('OpenTelemetry shut down');
  });
  return { app, server };
}

export function currentTelemetryInfo(): SpanContext | undefined {
  const currentSpan = trace.getSpan(context.active());
  return currentSpan?.spanContext();
}
