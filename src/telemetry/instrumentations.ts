import type { Instrumentation } from '@opentelemetry/instrumentation';

// import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { GenericPoolInstrumentation } from '@opentelemetry/instrumentation-generic-pool';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { LruMemoizerInstrumentation } from '@opentelemetry/instrumentation-lru-memoizer';
import { NetInstrumentation } from '@opentelemetry/instrumentation-net';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RedisInstrumentation as RedisInstrumentationV2 } from '@opentelemetry/instrumentation-redis';
import { RedisInstrumentation as RedisInstrumentationV4 } from '@opentelemetry/instrumentation-redis-4';

const InstrumentationMap = {
  // Disable this for now because it logs a stupid message
  // '@opentelemetry/instrumentation-aws-lambda': AwsLambdaInstrumentation,
  '@opentelemetry/instrumentation-aws-sdk': AwsInstrumentation,
  '@opentelemetry/instrumentation-dns': DnsInstrumentation,
  '@opentelemetry/instrumentation-express': ExpressInstrumentation,
  '@opentelemetry/instrumentation-generic-pool': GenericPoolInstrumentation,
  '@opentelemetry/instrumentation-graphql': GraphQLInstrumentation,
  '@opentelemetry/instrumentation-http': HttpInstrumentation,
  '@opentelemetry/instrumentation-ioredis': IORedisInstrumentation,
  '@opentelemetry/instrumentation-lru-memoizer': LruMemoizerInstrumentation,
  '@opentelemetry/instrumentation-net': NetInstrumentation,
  '@opentelemetry/instrumentation-pg': PgInstrumentation,
  '@opentelemetry/instrumentation-pino': PinoInstrumentation,
  '@opentelemetry/instrumentation-redis': RedisInstrumentationV2,
  '@opentelemetry/instrumentation-redis-4': RedisInstrumentationV4,
};

// Config types inferred automatically from the first argument of the constructor
type ConfigArg<T> = T extends new (...args: infer U) => unknown ? U[0] : never;
export type InstrumentationConfigMap = {
  [Name in keyof typeof InstrumentationMap]?: ConfigArg<typeof InstrumentationMap[Name]>;
};

export function getAutoInstrumentations(
  inputConfigs: InstrumentationConfigMap = {},
): Instrumentation[] {
  const keys = Object.keys(InstrumentationMap) as Array<keyof typeof InstrumentationMap>;
  return keys
    .map((name) => {
      const Instance = InstrumentationMap[name];
      // Defaults are defined by the instrumentation itself
      const userConfig = inputConfigs[name] ?? {};

      try {
        return new Instance(userConfig);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Failed to load ${name}`, e);
        return null;
      }
    })
    .filter((i) => !!i) as Instrumentation[];
}
