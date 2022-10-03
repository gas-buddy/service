import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import * as opentelemetry from '@opentelemetry/sdk-node';

import { getAutoInstrumentations } from './instrumentations';

import type { DelayLoadServiceStartOptions } from '../types';

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

export default async function startWithTelemetry(options: DelayLoadServiceStartOptions) {
  const sdk = new opentelemetry.NodeSDK({
    serviceName: options.name,
    autoDetectResources: true,
    traceExporter: getExporter(),
    instrumentations: [getAutoInstrumentations()],
  });
  await sdk.start();

  const { startApp, listen, importServiceDefinition } = await import('../express/app.js');
  const service = await importServiceDefinition(options.service);
  const app = await startApp({ ...options, service });
  app.locals.logger.info('OpenTelemetry enabled');

  const server = await listen(app, async () => {
    await sdk.shutdown();
    app.locals.logger.info('OpenTelemetry shut down');
  });
  return { app, server };
}
