import path from 'path';
import request from 'supertest';
import fakeServ, { FakeServLocals } from './fake-serv/src/index';
import {
  listen, ServiceStartOptions, shutdownApp, startApp,
} from '../src/index';

describe('fake-serv', () => {
  test('basic service functionality', async () => {
    const options: ServiceStartOptions<FakeServLocals> = {
      service: fakeServ,
      name: 'fake-serv',
      rootDirectory: path.resolve(__dirname, './fake-serv'),
      codepath: 'src',
    };
    const app = await startApp(options).catch((error) => {
      console.error(error);
      throw error;
    });
    expect(app).toBeTruthy();

    let { body } = await request(app).get('/world').timeout(500).expect(200);
    expect(body.hello).toEqual('world');

    ({ body } = await request(app).get('/other/world').timeout(500).expect(200));
    expect(body.hello).toEqual('jupiter');

    ({ body } = await request(app).get('/hello').query({ greeting: 'Hello Pluto!', number: '6', break_things: true }).expect(200));
    expect(body.greeting).toEqual('Hello Pluto!');

    // Can't convert green to a number
    await request(app).get('/hello').query({ greeting: 'Hello Pluto!', number: 'green' }).expect(400);

    // Make sure body paramater conversion works
    await request(app).post('/hello').send({ number: 'green' }).expect(400);
    await request(app).post('/hello').send({ number: '6' }).expect(204);
    await request(app).post('/hello').send({ number: 6 }).expect(204);

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

    // Call metrics
    await request(secondApp).get('/world').expect(200);
    await request(secondApp.locals.internalApp).get('/metrics')
      .expect(200)
      .expect((res) => expect(res.text).toMatch(/world_requests_total{method="get"} 1/));

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

  test('allow configuration modification before starting service', async () => {
    let configSpy;

    const options: ServiceStartOptions<FakeServLocals> = {
      service: fakeServ,
      name: 'fake-serv',
      rootDirectory: path.resolve(__dirname, './fake-serv'),
      codepath: 'src',
      configChanges: (app) => {
        configSpy = jest.spyOn(app.locals.config, 'get');
        return {
          logging: {
            ...app.locals.config.get('logging'),
            level: 'warn',
          },
        };
      },
    };

    const app = await startApp(options).catch((error) => {
      console.error(error);
      throw error;
    });
    expect(app).toBeTruthy();

    expect(configSpy).toHaveBeenCalled();

    const { body } = await request(app).get('/world').timeout(500).expect(200);
    expect(body.hello).toEqual('world');

    // Mocking
    await request(app).post('/world').expect(500);

    // Clean shutdown
    await expect(shutdownApp(app)).resolves.toBeUndefined();
  });
});
