import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import * as opentelemetry from '@opentelemetry/sdk-node';

import { getAutoInstrumentations } from './instrumentations';

import type { DelayLoadServiceStartOptions, ServiceStartOptions } from '../types';

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

export async function startWithTelemetry(options: DelayLoadServiceStartOptions) {
  const sdk = new opentelemetry.NodeSDK({
    serviceName: options.name,
    autoDetectResources: true,
    traceExporter: getExporter(),
    instrumentations: [getAutoInstrumentations()],
  });
  await sdk.start();

  const { startApp, listen } = await import('../express/app.js');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { default: service, configure } = require(options.service);
  const startOptions: ServiceStartOptions = { ...options, service };
  if (typeof configure === 'function') {
    // Give the service a chance to modify the startup options (mostly for config dirs)
    configure(startOptions);
  }
  const app = await startApp(startOptions);
  app.locals.logger.info('OpenTelemetry enabled');

  const server = await listen(app, async () => {
    await sdk.shutdown();
    app.locals.logger.info('OpenTelemetry shut down');
  });
  return { app, server };
}
