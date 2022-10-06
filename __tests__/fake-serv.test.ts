import path from 'path';
import request from 'supertest';
import { startApp } from '@pkg/express-app/app';
import fakeServ from './fake-serv/src/index';

describe('fake-serv', () => {
  test('basic service functionality', async () => {
    const app = await startApp({
      service: fakeServ,
      name: 'fake-serv',
      rootDirectory: path.resolve(__dirname, './fake-serv'),
      codepath: 'src',
    });
    expect(app).toBeTruthy();

    let { body } = await request(app).get('/world').timeout(500).expect(200);
    expect(body.hello).toEqual('world');

    ({ body } = await request(app).get('/other/world').timeout(500).expect(200));
    expect(body.hello).toEqual('jupiter');

    ({ body } = await request(app)
      .get('/hello')
      .query({ greeting: 'Hello Pluto!' })
      .timeout(1000)
      .expect(200));
    expect(body.greeting).toEqual('Hello Pluto!');

    ({ body } = await request(app).get('/error/sync').timeout(1000).expect(500));
    expect(body.code).toEqual('SyncError');

    ({ body } = await request(app).get('/error/async').timeout(1000).expect(500));
    expect(body.code).toEqual('AsyncError');
  });
});
