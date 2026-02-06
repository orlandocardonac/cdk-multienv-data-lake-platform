#!/usr/bin/env node

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MetricsLakeStack } from '../lib/metrics-lake-stack';
import { getStageConfig, type StageName } from '../lib/stage-config';

const app = new cdk.App();

const stage = (app.node.tryGetContext('stage') ?? 'dev') as StageName;
const config = getStageConfig(stage);

new MetricsLakeStack(app, `MetricsLake-${stage}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? config.region,
  },
  stage,
  config,
});
