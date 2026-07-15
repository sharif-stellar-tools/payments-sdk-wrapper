export interface MockResponseConfig {
  status: number;
  body: any;
  delay?: number;
}

export interface MockResponseOverrides {
  [key: string]: MockResponseConfig;
}

export interface MockServerConfig {
  port?: number;
  prefix?: string;
  responses?: MockResponseOverrides;
  verbose?: boolean;
}