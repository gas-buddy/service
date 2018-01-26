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