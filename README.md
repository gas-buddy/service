@gasbuddy/service
=================

An opinionated framework for building configuration driven services - web, api, or job. Uses swagger, pino logging, express, confit, Typescript and Jest.

This module creates an environment that makes it simpler to host a web service
(less repetition, more enterprise grade features). Wherever possible, we use off
the shelf infrastructure (OpenAPI, Express@5, Terminus are examples). The goal is to allow
you to enjoy a high level of type safety with a low tax in type construction in a
microservice environment.

In previous versions of this module, we relied on configuration files to "hydrate"
a number of objects into the runtime. We have moved away from that in favor of
just creating objects in a simple service Typescript file that plays much nicer
with type safety.

The module takes care of configuration-driven:

* body logging
* json parsing
* error handling
* hosted OpenAPI documents/handlers
* traditional routing
* graceful shutdown
* health checks

Our services (like this module) use Typescript with Node 18, which involves transpilation.
This module takes that into account across the development and production experience.

This needs lots more documentation... Just a start.