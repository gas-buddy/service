import pino from 'pino';

export type BaseLoggerOptions = {
  shouldPrettyPrint?: boolean;
  runId?: string;
  destination: pino.DestinationStream,
};

let logger: pino.Logger;

export default function getLogger(options: BaseLoggerOptions) {
  if (logger) {
    return logger;
  }

  const { shouldPrettyPrint, runId, destination } = options;
  logger = pino({
    ...shouldPrettyPrint && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    },
    destination,
    formatters: {
      bindings(bindings: pino.Bindings) {
        const updatedBindings = {
          ...bindings,
          trace_id: bindings.trace_id // Use trace_id if available
            || bindings.correlationid || bindings.c // Use correlationid if available
            || runId // Use runId if available - used in case of jobs and utilities
            || undefined, // Dont set if none of the above are available,
        };
        return updatedBindings;
      },
      ...shouldPrettyPrint ? {} : {
        level(label) {
          return { level: label };
        },
      },
    },
  });

  return logger;
}
