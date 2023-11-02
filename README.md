@gasbuddy/service
=================

[![Node CI](https://github.com/gas-buddy/service/actions/workflows/nodejs.yml/badge.svg)](https://github.com/gas-buddy/service/actions/workflows/nodejs.yml)

An opinionated framework for building high scale services - web, api, or job. Uses OpenAPI, pino, express, confit, Typescript and jest.

This module creates an environment that makes it simpler to host a REST service
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
* Telemetry and instrumentation

Our services (like this module) use Typescript with Node 18, which involves transpilation.
This module takes that into account across the development and production experience.

### Working with this repo

```bash
git clone git@github.com:gas-buddy/service.git
cd service
npx corepack enable ### This is required to work with yarn 2+
nvm use ### Use node 18+ as specified in .nvmrc - this same version also gets used in github workflows
yarn set version self ### Use same version as set in package.json, specified as packageManager
yarn install
yarn build
```

This needs lots more documentation... Just a start.
