export interface ConfigStore {
  // Confit supports more things, but that's not how we intend it to be used.
  get(name: string): any;
  set(name: string, value: any): void;
}
