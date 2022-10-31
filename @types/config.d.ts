declare module 'shortstop-handlers' {
  export function require(module: string): ReturnType<NodeRequire>;
  export function env(): (envVarName: string) => string | undefined;
  export function base64(): (blob: string) => Buffer;
  export function path(baseDir?: string): (relativePath: string) => string;
  export function file(baseDir?: string): (relativePath: string) => Buffer | string;
}

declare module 'shortstop-yaml' {
  export default function yaml(
    basepath: string,
  ): (path: string, callback: (error?: Error, result?: {}) => void) => void;
}

declare module 'shortstop-dns' {
  export default function dns(opts?: {
    family?: number;
    all?: boolean;
  }): (address: string, callback: (error?: Error, result?: string[]) => void) => void;
}

declare module '@gasbuddy/confit' {
  type ProtocolFn = (value: any, callback?: any) => void;

  interface ProtocolsSetPrivate {
    [protocol: string]: ProtocolFn | ProtocolFn[];
  }

  interface ConfigStore {
    get(name: string): any;
    set<T>(name: string, newValue: T): T;
    use(newSettings: Object): void;
  }

  type Options = {
    basedir: string;
    protocols: ProtocolsSetPrivate;
  };

  interface ConfigFactory {
    create(callback: (err: any, config: ConfigStore) => any): void;
    addOverride(filepathOrSettingsObj: string | Object): this;
    addDefault(filepathOrSettingsObj: string | Object): this;
  }

  function confit(optionsOrBaseDir: Options | string): ConfigFactory;

  namespace confit {
    export interface ProtocolsSet extends ProtocolsSetPrivate {}
  }

  export = confit;
}
