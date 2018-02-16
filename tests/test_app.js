import tap from 'tap';
import path from 'path';
import winston from 'winston';
import request from 'supertest';
import * as service from '../src/index';

if (process.env.NODE_ENV === 'test') {
  winston.remove(winston.transports.Console);
}

const sourcedir = path.join(__dirname, 'app', 'src');

tap.test('run batch job', async (t) => {
  let ran = false;
  await service.runWithService(() => { ran = true; }, { srcRoot: sourcedir });
  t.ok(ran, 'Should run the async function');
});

tap.test('service startup', async (t) => {
  const s = new service.Service('hello-serv');
  t.ok(s, 'should construct');
  t.ok(service.Service.get({ app: s.app }), 'Service should save on simulated request');
  await s.configure(sourcedir);
  t.ok(s.app, 'should make an app');
  t.strictEquals(s.name, 'hello-serv', 'name should match');
  t.ok(Array.isArray(s.config.get('google')), 'DNS shortstop should work');
  t.strictEquals(s.config.get('envswitchoff'), false, 'Default false');
  t.strictEquals(s.config.get('envswitchon'), true, 'Default true');

  const oldError = winston.error;

  tap.test('test simple request', async (tt) => {
    const res = await request(s.app).post('/simple').send({ ok: true });
    tt.strictEquals(res.status, 200, 'should be status 200');
    tt.strictEquals(res.body.ok, true, 'should return body');
  });

  tap.test('test sync error', async (tt) => {
    tt.plan(4);

    winston.error = (...args) => {
      tt.strictEquals(args[0], 'Handler exception', 'error should be logged');
      tt.strictEquals(args[1].message, 'Thrown synchronously', 'message should match');
      tt.ok(args[1].stack, 'Error should have a stack');
    };

    const res = await request(s.app).get('/error/sync');
    tt.strictEquals(res.status, 500, 'Should get 500 error');
  });

  tap.test('test async error', async (tt) => {
    tt.plan(4);

    winston.error = (...args) => {
      tt.strictEquals(args[0], 'Handler exception', 'error should be logged');
      tt.strictEquals(args[1].message, 'Thrown in a promise', 'message should match');
      tt.ok(args[1].stack, 'Error should have a stack');
    };

    const res = await request(s.app).get('/error/async');
    tt.strictEquals(res.status, 500, 'Should get 500 error');
  });

  tap.test('test helper error', async (tt) => {
    tt.plan(9);

    winston.error = (...args) => {
      tt.strictEquals(args[0], 'Handler exception', 'error should be logged');
      tt.strictEquals(args[1].code, 'helpererror', 'code should match');
      tt.strictEquals(args[1].status, 599, 'status should match');
      tt.strictEquals(args[1].domain, s.name, 'domain should be service name');
      tt.strictEquals(args[1].message, 'helper error message', 'message should match');
      tt.strictEquals(args[1].reqMethod, 'GET', 'message should match');
      tt.strictEquals(args[1].reqUrl, '/error/helper', 'message should match');
      tt.ok(args[1].stack, 'Error should have a stack');
    };

    const res = await request(s.app).get('/error/helper');
    tt.strictEquals(res.status, 599, 'Should get 599 error');
  });

  // TODO: Reintroduce explicit 404 handling at the right place.
  // tap.test('test 404', async (tt) => {
  //   tt.plan(2);

  //   winston.error = (...args) => {
  //     tt.strictEquals(args[0], 'No handler for request. Returning 404',
  //                     'error should be logged');
  //   };

  //   const res = await request(s.app).get('/error/404');
  //   tt.strictEquals(res.status, 404, 'Should get 404 error');
  // });

  winston.error = oldError;

  await s.destroy();
  t.ok(true, 'app should stop');
});

tap.test('server startup', async (t) => {
  const s = new service.Server('pet-serv');
  t.ok(s, 'should construct');
  await s.create(sourcedir);
  t.ok(s.servers, 'should have servers');

  const httpPort = s.servers[1].address().port;
  // Need a real server for this one
  try {
    let before;
    let after;
    s.service.once(service.Service.Event.BeforeServiceCall, (req) => {
      t.strictEquals(req.url, `http://localhost:${httpPort}/hello/world`,
        'Should have a request url');
      req.kilroyWasHere = true;
      before = true;
    });
    s.service.once(service.Service.Event.AfterServiceCall, (res, req) => {
      t.strictEquals(req.url, `http://localhost:${httpPort}/hello/world`, 'Should have a request url');
      t.strictEquals(res.url, `http://localhost:${httpPort}/hello/world`, 'Should have a request url');
      t.ok(req.kilroyWasHere, 'Should be the same request');
      after = true;
    });
    const res = await request(s.service.app)
      .get(`/callSelf?port=${httpPort}`)
      .set('CorrelationId', 'FAKE_CORRELATION_ID');
    t.strictEquals(res.status, 200, 'should be status 200');
    t.strictEquals(res.body.span, '1.1', 'Span tracking should work');
    t.ok(before, 'BeforeServiceCall event should be emitted');
    t.ok(after, 'AfterServiceCall event should be emitted');
  } catch (error) {
    t.fail(error);
  }

  const { body: superBody, status: superStatus } = await request(s.service.app)
    .get(`/callSelf/superagent?port=${httpPort}&ep=simple`)
    .set('CorrelationId', 'FAKE_CORRELATION_ID');
  t.strictEquals(superBody.body.hello, 'world', 'Should return the expected body');
  t.strictEquals(superBody.headers['custom-header'], 'hello-world', 'Should receive header');
  t.strictEquals(superStatus, 200, 'Should get a 200');

  const { body: failBody, status: failStatus } = await request(s.service.app)
    .get(`/callSelf/superagent?port=${httpPort}&ep=simple-fail`)
    .set('CorrelationId', 'FAKE_CORRELATION_ID');
  t.strictEquals(failBody.status, 404, 'Should get a 404 from catch');
  t.strictEquals(failStatus, 200, 'Should get a 200');

  const ctr = new (s.service.metrics.Counter)('test_metric', 'test_metric_help');
  t.ok(ctr, 'Should make a new Counter metric');
  ctr.inc(99);
  ctr.inc(2);
  await Promise.all([
    s.service.fakemetrics.fakeIt(),
    s.service.fakemetrics.fakeError(),
  ]);
  const res = await request(s.service.metrics.app)
    .get('/metrics');
  t.match(res.text, /superagent_http_requests_bucket/, 'Should have a superagent metric');
  t.match(res.text, /superagent_http_requests_sum{[^}]+\bmethod=[^}]+}/, 'Superagent metric should have a method');
  t.match(res.text, /# TYPE test_metric counter/, 'Should have our counter');
  t.match(res.text, /test_metric 101/, 'Should have our counter value');
  t.match(res.text, /faker_count{source="pet-serv",success="true"}/, 'Should have faker');
  t.match(res.text, /faker_error_count{source="pet-serv",success="false"}/, 'Should have faker');

  const mdres = await request(s.service.metadata.app)
    .get('/connections/fakemetrics');
  t.strictEquals(mdres.status, 200, 'Should get 200 from module metadata');
  t.same(mdres.body, { ok: true }, 'Should get proper metadata');

  const md404 = await request(s.service.metadata.app)
    .get('/connections/nobodyhome');
  t.strictEquals(md404.status, 404, 'Should 404 for non existent connection');

  const mdhealth = await request(s.service.metadata.app)
    .get('/health');
  t.strictEquals(mdhealth.status, 200, 'Should get 200 health check');

  const mdmodules = await request(s.service.metadata.app)
    .get('/modules?depth=1');
  t.strictEquals(mdmodules.status, 200, 'Should get 200 module check');

  await s.destroy();
  t.ok(true, 'servers should stop');
});

tap.test('SIGTERM shutdown', async (t) => {
  const s = new service.Server('pet-serv');
  t.ok(s, 'should construct');
  await s.create(sourcedir);
  t.ok(s.servers, 'should have servers');

  process.emit('SIGTERM');
});
