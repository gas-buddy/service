import pino from 'pino';
import { isDev } from '../env';

export type BaseLoggerOptions = {
  shouldPrettyPrint?: boolean;
  destination: pino.DestinationStream,
  meta?: Record<string, any>;
};

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
        destination,
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
      formatters: {
        bindings(bindings: pino.Bindings) {
          return getBindings(bindings, meta);
        },
      },
    };
  } else {
    loggerOptions = {
      destination,
      formatters: {
        bindings(bindings: pino.Bindings) {
          return getBindings(bindings, meta);
        },
        level(label: string) {
          return { level: label };
        },
      },
    };
  }

  const logger = pino(loggerOptions);
  return logger;
}
