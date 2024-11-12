import pino from 'pino';
import { isDev } from '../env';
import { currentTelemetryInfo } from '../telemetry';

function ensureTracing(logInfo: object) {
  if (!('trace_id' in logInfo)) {
    const currentSpan = currentTelemetryInfo();
    if (currentSpan) {
      Object.assign(logInfo, {
        trace_id: currentSpan.traceId,
        span_id: currentSpan.spanId,
        trace_flags: currentSpan.traceFlags,
      });
    }
  }
  return logInfo;
}

function getBindings(bindings: pino.Bindings, meta?: Record<string, any>) {
  const updatedBindings = {
    ...bindings,
    ...meta,
  };
  return updatedBindings;
}

export function getLogger(meta?: Record<string, any>) {
  const shouldPrettyPrint = isDev() && !process.env.NO_PRETTY_LOGS;
  const destination = pino.destination({
    dest: process.env.LOG_TO_FILE || process.stdout.fd,
    minLength: process.env.LOG_BUFFER ? Number(process.env.LOG_BUFFER) : undefined,
  });

  let loggerOptions;
  if (shouldPrettyPrint) {
    loggerOptions = {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
      formatters: {
        bindings(logInfo: pino.Bindings) {
          return getBindings(logInfo, meta);
        },
      },
      mixin: ensureTracing,
    };
  } else {
    loggerOptions = {
      formatters: {
        bindings(logInfo: pino.Bindings) {
          return getBindings(logInfo, meta);
        },
        level(label: string) {
          return { level: label };
        },
      },
      mixin: ensureTracing,
    };
  }

  return pino(loggerOptions, destination);
}
