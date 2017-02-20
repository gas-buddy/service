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