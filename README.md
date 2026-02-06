# cdk-multienv-data-lake-platform

This repository is a **demo** inspired by a **real-world data lake foundation** that was part of multiple projects delivered for a major telecommunications company in Mexico. The goal is to showcase a pragmatic, enterprise-style AWS CDK setup that supports multi-environment deployments and a simple metrics ingestion/processing/query pipeline.

The implementation is intentionally simplified (mock data source and mock CSV→Parquet step) so you can understand and run it quickly, while keeping production-grade concepts: secure-by-default S3, IAM least privilege, Glue Catalog, Athena, and API exposure.

## Architecture (high level)

Data flow (demo):

1. **Scheduled Lambda (every minute)** generates a CSV metrics record (simulating a call to a fictitious service like `metris_api.com`).
2. The CSV is stored in an environment-specific S3 bucket under a partitioned prefix:
   - `raw/year=YYYY/month=MM/day=DD/hour=HH/<service>-HH-mm_.csv`
3. **S3-triggered Lambda** processes newly created objects under `raw/`:
   - Moves the object to `processed/` and renames to `.parquet` (mock parquet)
   - Triggers a **Glue Crawler** to refresh the Data Catalog
4. **Athena Query Lambda** runs a query against the cataloged table and is exposed through **API Gateway**.

## Multi-environment (dev / qa / prod)

This project deploys the same stack to multiple environments using a `stage` context variable.

- `dev`, `qa`, `prod` are configured in `lib/stage-config.ts`.
- Deploy commands:
  - `cdk deploy -c stage=dev`
  - `cdk deploy -c stage=qa`
  - `cdk deploy -c stage=prod`

### Naming

Buckets are environment-specific and must follow S3 naming rules (no underscores). Defaults:

- `meticsxmin-dev`
- `meticsxmin-qa`
- `meticsxmin-prod`

API names are stage-specific (example):

- `orlandoapi_dev`
- `orlandoapi_qa`
- `orlandoapi_prod`

## API Security (NONE / IAM / Cognito)

API security is configurable per stage via `apiAuthMode` in `lib/stage-config.ts`:

- `NONE`: public endpoint
- `IAM`: requires SigV4 signed requests (`AuthorizationType.IAM`)
- `COGNITO`: creates a Cognito User Pool + Authorizer and protects the endpoint

Outputs are emitted for Cognito in stages where it is enabled:

- `CognitoUserPoolId`
- `CognitoUserPoolClientId`

## CDK Stack

Main stack: `lib/metrics-lake-stack.ts`

It provisions:

- **S3 bucket** (secure by default: Block Public Access, encryption, SSL enforcement)
- **EventBridge rule** (rate(1 minute)) for ingestion
- **Glue Database** + **Glue Crawler**
- **Athena Workgroup** with results stored in S3
- **API Gateway REST API** with CORS enabled

## Lambda code layout (project-style)

Lambda handlers are organized following a real-project layout pattern:

```
handlers/
  projects/
    metrics/
      ingest/
        index.py
        validator.py
        event/dev.json
        test.py
      process/
        index.py
        validator.py
        event/dev.json
        test.py
      query/
        index.py
        validator.py
        event/dev.json
        test.py
```

CDK points to these folders and uses `index.handler`.

## Local development

### Install

```powershell
npm install
```

### Build

```powershell
npm run build
```

### Synthesize

```powershell
npx cdk synth -c stage=dev
```

### Run Python unit tests

If you have Python installed (Windows launcher `py`), run:

```powershell
npm run test:py
```

### Run a handler locally with its sample event

Each handler includes a `test.py` that reads the corresponding `event/dev.json`. Example:

```powershell
py -3 -m handlers.projects.metrics.ingest.test
```

## Notes

- The CSV→Parquet conversion is **mocked** to keep the demo lightweight.
- This project is meant to be an educational starter for multi-environment CDK + data lake patterns.
