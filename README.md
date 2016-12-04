@gasbuddy/service
=================

An opinionated framework for building configuration driven services - web, api, or job. Uses swagger, winston, express, confit, ES7 and tap.

Basically, this module is in charge of instantiating a bunch of
application dependencies like:

* database connections
* swagger clients
* custom trusted certificates

and then loading express middleware

* body logging
* json parsing
* error handling
* async handler support
* hosted swagger documents/handlers
* web routes

Our services (like this module) use ES7 including async/await via babel. Where
necessary, we accomodate that in this module. For example, shortstop handlers in
confit have the ability to refer to the transpiled directory in production and
the original directory in development.

This needs lots more documentation... Just a start.