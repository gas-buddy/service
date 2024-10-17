import pino from 'pino';

export type BaseLoggerOptions = {
  shouldPrettyPrint?: boolean;
  destination: pino.DestinationStream,
};

let logger: pino.Logger;

export function getLogger(options: BaseLoggerOptions) {
  if (logger) {
    return logger;
  }

  const { shouldPrettyPrint, destination } = options;
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
