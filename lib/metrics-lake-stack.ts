import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { type StageConfig, type StageName } from './stage-config';

export interface MetricsLakeStackProps extends cdk.StackProps {
  stage: StageName;
  config: StageConfig;
}

export class MetricsLakeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MetricsLakeStackProps) {
    super(scope, id, props);

    const { stage, config } = props;

    const workgroupName = `metrics-wg-${stage}`;
    const crawlerName = `metrics-crawler-${stage}`;

    const dataBucket = new s3.Bucket(this, 'MetricsBucket', {
      bucketName: config.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: stage === 'prod' ? false : true,
    });

    const athenaResultsPrefix = 'athena-results/';

    const workgroup = new athena.CfnWorkGroup(this, 'AthenaWorkgroup', {
      name: workgroupName,
      state: 'ENABLED',
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        resultConfiguration: {
          outputLocation: `s3://${dataBucket.bucketName}/${athenaResultsPrefix}`,
        },
      },
    });

    const glueDb = new glue.CfnDatabase(this, 'GlueDatabase', {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseInput: {
        name: `metrics_db_${stage}`,
      },
    });

    const glueCrawlerRole = new iam.Role(this, 'GlueCrawlerRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
    });

    glueCrawlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole')
    );
    dataBucket.grantRead(glueCrawlerRole);

    const crawler = new glue.CfnCrawler(this, 'GlueCrawler', {
      name: crawlerName,
      role: glueCrawlerRole.roleArn,
      databaseName: glueDb.ref,
      targets: {
        s3Targets: [{ path: `s3://${dataBucket.bucketName}/processed/` }],
      },
      tablePrefix: 'metrics_',
      schemaChangePolicy: {
        updateBehavior: 'UPDATE_IN_DATABASE',
        deleteBehavior: 'DEPRECATE_IN_DATABASE',
      },
    });

    const ingestFn = new lambda.Function(this, 'IngestMetricsFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('handlers/projects/metrics/ingest'),
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      environment: {
        BUCKET_NAME: dataBucket.bucketName,
        STAGE: stage,
        SERVICE_BASE_URL: config.fakeServiceBaseUrl,
        IN_AWS: '1',
        ...config.env,
      },
    });

    dataBucket.grantPut(ingestFn);

    const scheduleRule = new events.Rule(this, 'IngestScheduleRule', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
    });
    scheduleRule.addTarget(new eventTargets.LambdaFunction(ingestFn));

    const processFn = new lambda.Function(this, 'ProcessObjectFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('handlers/projects/metrics/process'),
      handler: 'index.handler',
      timeout: Duration.minutes(2),
      memorySize: 512,
      environment: {
        BUCKET_NAME: dataBucket.bucketName,
        GLUE_CRAWLER_NAME: crawlerName,
        IN_AWS: '1',
        ...config.env,
      },
    });

    dataBucket.grantReadWrite(processFn);
    processFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['glue:StartCrawler'],
        resources: ['*'],
      })
    );

    dataBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processFn),
      { prefix: 'raw/' }
    );

    const queryFn = new lambda.Function(this, 'QueryAthenaFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('handlers/projects/metrics/query'),
      handler: 'index.handler',
      timeout: Duration.minutes(1),
      memorySize: 512,
      environment: {
        ATHENA_WORKGROUP: workgroupName,
        ATHENA_DATABASE: glueDb.ref,
        ATHENA_OUTPUT: `s3://${dataBucket.bucketName}/${athenaResultsPrefix}`,
        STAGE: stage,
        IN_AWS: '1',
        ...config.env,
      },
    });

    dataBucket.grantReadWrite(queryFn);
    queryFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'athena:StartQueryExecution',
          'athena:GetQueryExecution',
          'athena:GetQueryResults',
          'glue:GetDatabase',
          'glue:GetDatabases',
          'glue:GetTable',
          'glue:GetTables',
        ],
        resources: ['*'],
      })
    );

    const api = new apigw.RestApi(this, 'MetricsApi', {
      restApiName: config.apiName,
      deployOptions: {
        stageName: stage,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    let authorizer: apigw.IAuthorizer | undefined;
    if (config.apiAuthMode === 'COGNITO') {
      const userPool = new cognito.UserPool(this, 'ApiUserPool', {
        userPoolName: `metrics-userpool-${stage}`,
        selfSignUpEnabled: false,
        signInAliases: { email: true },
      });

      const userPoolClient = new cognito.UserPoolClient(this, 'ApiUserPoolClient', {
        userPool,
        userPoolClientName: `metrics-userpool-client-${stage}`,
        generateSecret: false,
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
      });

      authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
        cognitoUserPools: [userPool],
      });

      new cdk.CfnOutput(this, 'CognitoUserPoolId', { value: userPool.userPoolId });
      new cdk.CfnOutput(this, 'CognitoUserPoolClientId', { value: userPoolClient.userPoolClientId });
    }

    const metrics = api.root.addResource('metrics');
    const methodAuthType =
      config.apiAuthMode === 'IAM'
        ? apigw.AuthorizationType.IAM
        : config.apiAuthMode === 'COGNITO'
          ? apigw.AuthorizationType.COGNITO
          : apigw.AuthorizationType.NONE;

    metrics.addMethod('GET', new apigw.LambdaIntegration(queryFn), {
      authorizationType: methodAuthType,
      authorizer: authorizer,
    });

    new cdk.CfnOutput(this, 'BucketName', { value: dataBucket.bucketName });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
