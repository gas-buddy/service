1.0.2
=====
* Add the service itself to the context during hydration

1.0.4
=====
* Take ALL hydrated objects into the req-specific version to allow more consistent referencing

1.1.0
=====
* Change CorrelationId to correlationid everywhere since express headers are always lower cased
* Add request/response events to the service on swagger outbound calls to enable metrics

2.0.0
=====
* Removed exported Logger class in favor of a logger property on the Service.

2.3.0
=====
* Apply hydrated objects to the service while they are being hydrated (they will be a promise until they resolve to a value).
This means you can just `await service.foobar` in your hydrated object's start method to depend on another object.

2.4.0
=====
* Get rid of custom time in logs in favor of plain epoch
* Add support for a "spanid" in the headers (through to logs) for distributed tracing

3.x
=====
* Support for web projects
* Added url encoded form parsing and a static handler for "./static" to servicetype:web
* Swagger errors include URL now to provide more useful debug info
* Default timeout for swagger calls is now 20 seconds
* regex shortstop handler to make regexes from config
* Major changes to error wrapping to try and generate more useful error logs without disclosing sensitive info - blacklists certain properties like 'response'
* Put higher precision timestamps in logs to avoid logstash truncation
* Add req.gb.throwError convenience method to throw properly formatted errors to the client
* Be consistent about using the field name "c" to log correlation id
* Always call "next" in middleware handler

4.0.0
=====
* **Graceful shutdown**: we will now interact with SIGTERM to try and drain outstanding requests before quitting
* Added a **metadata server** on port 3001 (by default) that will answer health requests as well as provide `npm ls` output.
* Add host value to all logs from env:HOSTNAME
* Add a prometheus client for metrics and add a request metric for all requests
* Add metricsShim module that helps track any module that has "start/finish/error" events that can be discovered
* Start allocating a spanId so that hopefully we can trace request flow across services where clock may skew enough to not be a useful source of information
* Add dns shortstop handler for service resolution
* Add env_switch shortstop handler to allow env vars with either true/false defaults. env_switch:!FOO would default to true, env_switch:FOO would default to false
* Add start-server script that does most of what we normally do to run a service. This avoids similar boilerplate in your project

4.0.1
=====
* Fix dur (duration) to be fractional seconds

4.0.2
=====
* Add method to prometheus request metric

4.1.0
=====
* Add runWithService to bring up a service, run a function, and then tear it down

4.1.1
=====
* Add hostname to request logs for consistency

4.1.2
=====
* REPL is now promise aware just to make life easier
* Pass service to hydration shutdown

4.2.0
=====
* runWithService now passes a synthetic "req-like" object to your function that has a custom logger and service proxy

4.3.0
=====
* Change spanid header to span, mostly to avoid a bug with spanid header and old services (causing a 'null ref' error)

4.3.3
=====
* Provide a "req" object to repl
* Parse babelrc because of bug with babel ignores [https://github.com/babel/babel/issues/4082]

4.5.0
=====
* finalHandlerFactory takes a shouldRenderResponse configuration argument now, allowing you to have your own final handler that decides whether to render HTML, redirect, or whatever, while still getting logs.
* metricsShim takes logAboveMs configuration value to log the operation names of things taking more than a configurable timeout in milliseconds.

4.6.0
=====
* If a hydrated module exposes a metadata function, ::3001/connections/OBJECT_NAME will return it

5.0.0
=====
* Move to node 8.9 which reduces the amount of transpiling to take advantage of built in support for various things (like async/await)

5.3.2
=====
* Avoid nesting errors coming from swagger clients by looking for code/domain/message on the body of the response and just passing along that data

5.4.0
=====
* Allow singleMetric config on metricsShim to centralize metrics with an operation label where desired

5.5.0
=====
* Log a "pre" event at the beginning of a request to aid in tracking down abandoned requests
* Use request-ip to properly get the originating client ip

5.6.0
=====
* Expose requestWithContext to front superagent with metrics, error logging, and correlation id/span id support

6.1.0
=====
* Update to the latest swagger-client (3.x) via configured-swagger-client. This has several breaking changes which we've tried
to ameliorate as best as possible given the ubiquity of service calls. See [MIGRATION](https://github.com/swagger-api/swagger-js/blob/master/docs/MIGRATION_2_X.md) for more.
    * obj is no longer present on swagger responses, body is the result of an operation. We've put an exception-throwing property in dev/test, but just echo obj to body in non-(dev|test).
    * requestInterceptor takes a request argument and responseInterceptor takes a response argument, whereas it used to be "this". In requestInterceptor, it is still "this" as well as the first arg, but responseInterceptor must be updated if you use it.
    * security infrastructure has changed though it shouldn't affect upstream usage
    * Proper JS errors are thrown and errObj is no longer returned
* Add service metrics collection for all inter-service calls (ported down from gb-services)

6.2.0
=====
* Change the way swagger errors and intercepted and decorated for more useful logs (restoring useful previous behavior)

6.4.0
=====
* Add `SUPERAGENT_LOGS` environment variable that will cause `requestWithContext` to log full requests (as curl commands) and responses of superagent traffic.

6.5.0
=====
* Add `LOG_INCOMING_REQUEST_BODIES` and `LOG_OUTGOING_RESPONSE_BODIES` environment variables that will cause bodies to be logged.

7.0.0
=====
* Move to pino logging framework instead of winston - simpler configuration, better performance, simpler model

7.3.0
=====
* Allow enabling `SUPERAGENT_LOGS` via config.

8.0.0
=====
* Updated babel-preset and affiliated modules

9.0.0
=====
* Updated babel-preset which removes the "gbTranspile" checks for non-compiled module inclusion (mostly for Webpack)

9.1.0
=====
* REPL now supports `--nosubs` to disable RabbitMQ subscriptions via @gasbuddy/configured-rabbitmq-client
* REPL now stores history
* The *result* of the last completed Promise returned to the REPL is no available as `$`
* Updated superagent to v5 and updated other dependencies (no expected impact)

10.1.0
======
* Be smarter about log level for an error
* Make sure the base logger is NOT in extreme mode to avoid swallowing startup messages where there is no real volume to cause a flush

10.6.0
======
* Get updated pino with some modified options (though hopefully hidden by @gasbuddy/configured-pino)
* Get updated rest-api-support and configured-swagger-client with support for per service and per request timeouts

11.0.0
======
* Complete rewrite in Typescript targeting Node 18 or greater
* Uses res.locals and app.locals instead of req.gb.
* Uses OpenTelemetry instead of bespoke logging/tracing/metric instrumentation
* Pino seems to have flipped logging metadata arguments - what was logger.info('message', { ...stuff }) is now logger.info({ ...stuff }, 'message')
* Switch to Jest from Tap

12.0.0
======
* Move some configuration keys under "server" setting - see schema.ts for the update

12.22.0
=======

* Add support for tracing using `runId` through startup options and app.locals
* Add `runWithService` hook to support writing cronjobs and cli utilities
* Reorganized middleware relate code

12.23.0
=======

* Remove support for `runId` used to add trace_id to logs
* Remove `runWithService` and `useService` hooks
* Make logger customizable with additional metadata passed in args to apply to log bindings
* Use single instance of `telemetry` for app startup

12.24.0
=======

* Add currentTelemetryInfo helper for callers to use current telemetry info with regards to traceId, span and traceFlags
* Update logger to ensure tracing info is injected using telemetry info if available
* Ensure outgoing service calls use a default request interceptor to pass on correlationid in headers
