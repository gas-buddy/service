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

  let res = await request(s.app).post('/simple').send({ ok: true });
  t.strictEquals(res.status, 200, 'should be status 200');
  t.strictEquals(res.body.ok, true, 'should return body');

  const oldError = winston.error;
  winston.error = (...args) => {
    t.strictEquals(args[0], 'Handler exception', 'error should be logged');
    t.strictEquals(args[1].message, 'Thrown synchronously', 'message should match');
  };
  res = await request(s.app).get('/error/sync');
  t.strictEquals(res.status, 500, 'Should get 500 error');

  winston.error = (...args) => {
    t.strictEquals(args[0], 'Handler exception', 'error should be logged');
    t.strictEquals(args[1].message, 'Thrown in a promise', 'message should match');
  };
  res = await request(s.app).get('/error/async');
  t.strictEquals(res.status, 500, 'Should get 500 error');

  winston.error = oldError;

  await s.destroy();
  t.ok(true, 'app should stop');
});

tap.test('server startup', async (t) => {
  const s = new service.Server('pet-serv');
  t.ok(s, 'should construct');
  await s.create(sourcedir);
  t.ok(s.servers, 'should have servers');
  await s.destroy();
  t.ok(true, 'servers should stop');
});
