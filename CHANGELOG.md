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