import { EventEmitter } from 'events';

export default class FakeMetrics extends EventEmitter {
  start() { return this; }

  async fakeIt() {
    const info = { operationName: 'faker' };
    this.emit('start', info);
    return new Promise(accept => setTimeout(() => {
      this.emit('finish', info);
      accept();
    }, 50));
  }

  async fakeError() {
    const info = { operationName: 'faker_error' };
    this.emit('start', info);
    return new Promise(accept => setTimeout(() => {
      this.emit('error', info);
      accept();
    }, 50));
  }

  // eslint-disable-next-line class-methods-use-this
  async metadata() {
    return new Promise(accept => setTimeout(() => {
      accept({ ok: true });
    }, 50));
  }
}
