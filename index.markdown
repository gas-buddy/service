---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: home
---

@gasbuddy/service is the core of an opinionated framework for building high scale services - web, api (internal or external), or job. Our platform uses OpenAPI, OpenTelemetry, pino, express, confit, Typescript and jest. We primarily deploy into Kubernetes clusters, though are looking to use Serverless where appropriate, and the framework tries to make decisions compatible with that goal.

This module creates an environment that makes it simpler to host a REST service (less repetition, more enterprise grade features). Wherever possible, we use off the shelf infrastructure (OpenAPI, Express@5, Terminus are examples). The goal is to allow you to enjoy a high level of type safety with a low tax in type construction in a microservice environment.

In previous versions of this module, we relied on configuration files to "hydrate" a number of objects into the runtime. We have moved away from that in favor of just creating objects in a simple service Typescript file that plays much nicer with type safety. In practice, changing configuration (especially when it's not as simple as an environment variable) is no simpler than changing code, and the tools to judge the quality of your code are significantly richer than those that judge the quality of your configuration. This is a verbose way of saying that `Typescript > JSON`.

The @gasbuddy/service module does the following main jobs:

1. Load multilevel environment aware configuration, merging configuration information as appropriate to yield a single hierarchical configuration store. We use [confit](https://github.com/krakenjs/confit).
2. Engage OpenTelemetry for tracing and metrics monitoring (via Prometheus-format metrics) and wire this into JSON-based pino logging.
3. Setup an Express@5 application with common service hosting options such as body parsing, error handling and graceful shutdown.
4. Find and load route handlers and static content serving.
5. Validate and load OpenAPI 3 specifications and wire up methods to path-based route handlers including support for authentication.
6. Launch a second express app to serve health checks and metrics
7. Setup infrastructure for interservice calls with tracing.
8. Provide a central service runner that handles loading your service and getting to a running state in both development and production environments.

In addition, these elements are stitched together in a way that allows type safety to as low a level as possible, and with as little syntax as possible. For example, to declare a handler for an OpenAPI method, you might do something like:

```
export const get: FakeServApi['hello']['get'] = async (req, res) => {
  res.json({ greeting: req.query.greeting || 'Hello World' });
};
```

* FakeServApi is an automatically generated type based on [openapi-typescript-express](https://github.com/gas-buddy/openapi-typescript-express) having parsed an OpenAPI specification.
* This handler will implement a GET on /hello, and now req and res are fully typed so they know the app.locals properties, res.locals properties, incoming argument formats and expected outbound body shape.
* Type safety is great, but Intellisense support is even better.
