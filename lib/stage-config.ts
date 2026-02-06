export type StageName = 'dev' | 'qa' | 'prod';

export type ApiAuthMode = 'NONE' | 'IAM' | 'COGNITO';

export type StageConfig = {
  stage: StageName;
  region: string;
  bucketName: string;
  apiName: string;
  apiAuthMode: ApiAuthMode;
  env: Record<string, string>;
  fakeServiceBaseUrl: string;
};

const configs: Record<StageName, StageConfig> = {
  dev: {
    stage: 'dev',
    region: 'us-east-1',
    bucketName: 'meticsxmin-dev',
    apiName: 'orlandoapi_dev',
    apiAuthMode: 'NONE',
    env: {
      METRICS_SOURCE: 'https://metris_api.com/dev',
      METRICS_API_KEY: 'dev-api-key-placeholder',
      FEATURE_FLAG_EXPERIMENT: 'true',
    },
    fakeServiceBaseUrl: 'https://metris_api.com',
  },
  qa: {
    stage: 'qa',
    region: 'us-east-1',
    bucketName: 'meticsxmin-qa',
    apiName: 'orlandoapi_qa',
    apiAuthMode: 'IAM',
    env: {
      METRICS_SOURCE: 'https://metris_api.com/qa',
      METRICS_API_KEY: 'qa-api-key-placeholder',
      FEATURE_FLAG_EXPERIMENT: 'true',
    },
    fakeServiceBaseUrl: 'https://metris_api.com',
  },
  prod: {
    stage: 'prod',
    region: 'us-east-1',
    bucketName: 'meticsxmin-prod',
    apiName: 'orlandoapi_prod',
    apiAuthMode: 'COGNITO',
    env: {
      METRICS_SOURCE: 'https://metris_api.com/prod',
      METRICS_API_KEY: 'prod-api-key-placeholder',
      FEATURE_FLAG_EXPERIMENT: 'false',
    },
    fakeServiceBaseUrl: 'https://metris_api.com',
  },
};

export function getStageConfig(stage: StageName): StageConfig {
  const cfg = configs[stage];
  if (!cfg) {
    throw new Error(`Unknown stage: ${stage}`);
  }
  return cfg;
}
