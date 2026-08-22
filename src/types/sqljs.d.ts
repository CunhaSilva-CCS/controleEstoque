declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export interface Statement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(params?: object): Record<string, unknown>;
    free(): boolean;
  }

  export interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string, prefix?: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
