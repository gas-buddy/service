import tap from 'tap';
import path from 'path';
import request from 'supertest';
import * as service from '../src/index';

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

  const oldError = s.logger.error;

  tap.test('test invalid JSON body logging', async (tt) => {
    const oldFn = s.logger.info;
    let gotExceptionWithBadBody = false;
    let gotMessageWithBody = false;
    s.logger.info = (msg, meta) => {
      gotExceptionWithBadBody = gotExceptionWithBadBody || meta.body?.includes('omfg do not log this');
      gotMessageWithBody = gotMessageWithBody || meta.body?.includes('redacted');
    };
    try {
      const res = await request(s.app).post('/simple')
        .set('Content-Type', 'application/json')
        .send('{omfg do not log this}');
      tt.strictEquals(res.status, 400, 'should be status 400');
      tt.ok(gotMessageWithBody, 'Should get a message with a body property');
      tt.notOk(gotExceptionWithBadBody, 'Should not get an exception with sensitive data in it');
    } finally {
      s.logger.info = oldFn;
    }
  });

  tap.test('test simple request', async (tt) => {
    const res = await request(s.app).post('/simple').send({ ok: true });
    tt.strictEquals(res.status, 200, 'should be status 200');
    tt.strictEquals(res.body.ok, true, 'should return body');
  });

  tap.test('test sync error', async (tt) => {
    tt.plan(4);

    s.logger.error = (...args) => {
      tt.strictEquals(args[0], 'Handler exception', 'error should be logged');
      tt.strictEquals(args[1].message, 'Thrown synchronously', 'message should match');
      tt.ok(args[1].stack, 'Error should have a stack');
    };

    const res = await request(s.app).get('/error/sync');
    tt.strictEquals(res.status, 500, 'Should get 500 error');
  });

  tap.test('test async error', async (tt) => {
    tt.plan(4);

    s.logger.error = (...args) => {
      tt.strictEquals(args[0], 'Handler exception', 'error should be logged');
      tt.strictEquals(args[1].message, 'Thrown in a promise', 'message should match');
      tt.ok(args[1].stack, 'Error should have a stack');
    };

    const res = await request(s.app).get('/error/async');
    tt.strictEquals(res.status, 500, 'Should get 500 error');
  });

  tap.test('test helper error', async (tt) => {
    tt.plan(9);

    s.logger.error = (...args) => {
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

  s.logger.error = oldError;

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
    s.service.serviceFactory.events.once('start', (req) => {
      t.strictEquals(req.request.url, 'http://localhost:8000/hello/world', 'Should have a request url');
      req.kilroyWasHere = true;
      before = true;
    });
    s.service.serviceFactory.events.once('finish', (req) => {
      t.strictEquals(req.request.url, `http://localhost:${httpPort}/hello/world`, 'Should have a request url that was transformed');
      t.ok(req.kilroyWasHere, 'Should be the same request');
      after = true;
    });
    const res = await request(s.service.app)
      .get(`/callSelf?port=${httpPort}`)
      .set('CorrelationId', 'FAKE_CORRELATION_ID');
    t.strictEquals(res.status, 200, 'should be status 200');
    t.strictEquals(res.body.sp, '1.1', 'Span tracking should work');
    t.ok(before, 'start event should be emitted');
    t.ok(after, 'finish event should be emitted');
  } catch (error) {
    t.fail(error);
  }

  const oldSuperagentLogs = s.service.config.get('log_superagent_requests');
  const oldInfo = s.service.logger.info;

  s.service.config.set('log_superagent_requests', false);
  s.service.logger.info = (...args) => {
    t.ok(!/curl/.test(args[0]), `Should not log superagent curls without env var set.: ${args[0]}`);
    oldInfo.apply(s.service.logger, args);
  };
  const { body: superBody, status: superStatus } = await request(s.service.app)
    .get(`/callSelf/superagent?port=${httpPort}&ep=simple`)
    .set('CorrelationId', 'FAKE_CORRELATION_ID');
  t.strictEquals(superBody.body.hello, 'world', 'Should return the expected body');
  t.strictEquals(superBody.headers['custom-header'], 'hello-world', 'Should receive header');
  t.strictEquals(superStatus, 200, 'Should get a 200');
  s.service.logger.info = oldInfo;
  s.service.config.set('log_superagent_requests', oldSuperagentLogs);

  s.service.config.set('log_superagent_requests', true);
  let foundCurl = false;
  s.service.logger.info = (...args) => {
    foundCurl = foundCurl || /curl/.test(args[0]);
    oldInfo.apply(s.service.logger, args);
  };
  const { body: failBody, status: failStatus } = await request(s.service.app)
    .get(`/callSelf/superagent?port=${httpPort}&ep=simple-fail`)
    .set('CorrelationId', 'FAKE_CORRELATION_ID');
  t.strictEquals(failBody.status, 404, 'Should get a 404 from catch');
  t.strictEquals(failStatus, 200, 'Should get a 200');
  t.ok(foundCurl, 'Should log superagent curls with env var set');
  s.service.logger.info = oldInfo;
  s.service.config.set('log_superagent_requests', oldSuperagentLogs);

  const { status: throwStatus } = await request(s.service.app)
    .get(`/callSelf/swaggerthrow?port=${httpPort}`);
  t.strictEquals(throwStatus, 500, 'Should get a 404 from catch');

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

  let jobAccept;
  const jobPromise = new Promise((accept) => { jobAccept = accept; });
  s.service.addJob('test-job', async (req, args, callback) => {
    callback(50);
    await new Promise(accept => setTimeout(accept, 10));
    t.ok(true, 'Should receive job and update progress');
    jobAccept(true);
  });
  await request(s.service.metadata.app)
    .post('/job')
    .send({
      callback_url: `http://localhost:${httpPort}/simple/job`,
      job_name: 'test-job',
    });
  t.ok(await jobPromise, 'Should complete queued job');

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
