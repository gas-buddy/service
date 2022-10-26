import path from 'path';
import { insertConfigurationBefore, loadConfiguration } from '../src/config';

describe('configuration loader', () => {
  test('overrides and shortstops', async () => {
    const rootDirectory = path.resolve(__dirname, './fake-serv');
    const config = await loadConfiguration({
      name: 'fake-serv',
      rootDirectory,
      configurationDirectories: [path.resolve(rootDirectory, './config')],
    });
    expect(config.get('logging:level')).toEqual('debug');
    expect(config.get('google')).toBeTruthy();
    expect(config.get('google')).not.toEqual('google.com');

    expect(config.get('envswitchoff')).toBeFalsy();
    expect(config.get('envswitchon')).toBeTruthy();

    expect(config.get('servicetype')).toBeTruthy();
    expect(config.get('notservicetype')).toBeFalsy();

    expect(config.get('testKms')).toBeTruthy();
    expect(config.get('testKms')).toEqual('HelloWorld');

    const orig = ['a', 'b', 'd'];
    const withC = insertConfigurationBefore(orig, 'c', 'd');
    expect(withC).toEqual(['a', 'b', 'c', 'd']);
    const withE = insertConfigurationBefore(orig, 'e', 'q');
    expect(withE).toEqual(['a', 'b', 'd', 'e', 'q']);
    expect(insertConfigurationBefore(undefined, 'a', 'b')).toEqual(['a', 'b']);
    expect(insertConfigurationBefore([], 'a', 'b')).toEqual(['a', 'b']);
  });
});
