import tap from 'tap';
import path from 'path';
import winston from 'winston';
import request from 'supertest';
import * as service from '../src/index';

if (process.env.NODE_ENV === 'test') {
  winston.remove(winston.transports.Console);
}

const sourcedir = path.join(__dirname, 'app', 'src');

tap.test('service startup', async (t) => {
  const s = new service.Service('hello-serv');
  t.ok(s, 'should construct');
  t.ok(service.Service.get({ app: s.app }), 'Service should save on simulated request');
  await s.configure(sourcedir);
  t.ok(s.app, 'should make an app');
  t.strictEquals(s.name, 'hello-serv', 'name should match');

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

  tap.test('test 404', async (tt) => {
    tt.plan(2);

    winston.error = (...args) => {
      tt.strictEquals(args[0], 'No handler for request. Returning 404', 'error should be logged');
    };

    const res = await request(s.app).get('/error/404');
    tt.strictEquals(res.status, 404, 'Should get 404 error');
  });

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
    t.ok(before, 'BeforeServiceCall event should be emitted');
    t.ok(after, 'AfterServiceCall event should be emitted');
  } catch (error) {
    t.fail(error);
  }

  await s.destroy();
  t.ok(true, 'servers should stop');
});
