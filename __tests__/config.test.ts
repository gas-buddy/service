import path from 'path';
import { loadConfiguration } from '../src/config';

describe("configuration loader", () => {
  test("overrides and shortstops", async () => {
    const rootDirectory = path.resolve(__dirname, "./fake-serv");
    const config = await loadConfiguration({
      name: "fake-serv",
      rootDirectory,
      configurationDirectories: [path.resolve(rootDirectory, "./config")]
    });
    expect(config.get("logging:level")).toEqual("warn");
    expect(config.get("google")).toBeTruthy();
    expect(config.get("google")).not.toEqual("google.com");

    expect(config.get("envswitchoff")).toBeFalsy();
    expect(config.get("envswitchon")).toBeTruthy();

    expect(config.get("servicetype")).toBeTruthy();
    expect(config.get("notservicetype")).toBeFalsy();
  });
});
