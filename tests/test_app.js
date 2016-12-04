import tap from 'tap';
import path from 'path';
import * as service from '../src/index';

const sourcedir = path.join(__dirname, 'app', 'src');

tap.test('service startup', async (t) => {
  const s = new service.Service('pet-serv');
  t.ok(s, 'should construct');
  await s.configure(sourcedir);
  t.ok(s.app, 'should make an app');
  t.strictEquals(s.name, 'pet-serv', 'name should match');
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
