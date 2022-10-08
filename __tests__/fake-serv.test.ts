import path from 'path';
import request from 'supertest';
import fakeServ from './fake-serv/src/index';
import {
  listen, ServiceStartOptions, shutdownApp, startApp,
} from '../src/index';

describe('fake-serv', () => {
  test('basic service functionality', async () => {
    const options: ServiceStartOptions = {
      service: fakeServ,
      name: 'fake-serv',
      rootDirectory: path.resolve(__dirname, './fake-serv'),
      codepath: 'src',
    };
    const app = await startApp(options);
    expect(app).toBeTruthy();

    let { body } = await request(app).get('/world').timeout(500).expect(200);
    expect(body.hello).toEqual('world');

    ({ body } = await request(app).get('/other/world').timeout(500).expect(200));
    expect(body.hello).toEqual('jupiter');

    ({ body } = await request(app).get('/hello').query({ greeting: 'Hello Pluto!' }).expect(200));
    expect(body.greeting).toEqual('Hello Pluto!');

    ({ body } = await request(app).get('/error/sync').timeout(1000).expect(500));
    expect(body.code).toEqual('SyncError');

    ({ body } = await request(app).get('/error/async').timeout(1000).expect(500));
    expect(body.code).toEqual('AsyncError');

    // Mocking
    await request(app).post('/world').expect(500);

    // Clean shutdown
    await expect(shutdownApp(app)).resolves.toBeUndefined();
    const secondApp = await startApp(options);

    // Make sure we can listen
    const server = await listen(secondApp);
    await new Promise<void>((accept, reject) => {
      server.close((e) => {
        if (e) {
          reject(e);
        } else {
          accept();
        }
      });
    });
  });
});
