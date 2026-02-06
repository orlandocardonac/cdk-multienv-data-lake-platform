import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-athena';

const athena = new AthenaClient({});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const handler = async (event: any): Promise<any> => {
  const workgroup = process.env.ATHENA_WORKGROUP;
  const database = process.env.ATHENA_DATABASE;
  const output = process.env.ATHENA_OUTPUT;

  if (!workgroup || !database || !output) {
    throw new Error('Missing ATHENA_WORKGROUP/ATHENA_DATABASE/ATHENA_OUTPUT');
  }

  const service = event?.queryStringParameters?.service;

  const table = 'metrics_processed';
  const where = service ? ` WHERE service = '${String(service).replace(/'/g, "''")}'` : '';
  const query = `SELECT * FROM ${table}${where} LIMIT 50`;

  const start = await athena.send(
    new StartQueryExecutionCommand({
      WorkGroup: workgroup,
      QueryString: query,
      ResultConfiguration: { OutputLocation: output },
      QueryExecutionContext: { Database: database },
    })
  );

  const qid = start.QueryExecutionId;
  if (!qid) {
    throw new Error('Athena did not return QueryExecutionId');
  }

  for (let i = 0; i < 20; i++) {
    const exec = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: qid }));
    const state = exec.QueryExecution?.Status?.State;

    if (state === 'SUCCEEDED') {
      break;
    }
    if (state === 'FAILED' || state === 'CANCELLED') {
      throw new Error(`Athena query ${state}: ${exec.QueryExecution?.Status?.StateChangeReason ?? 'unknown'}`);
    }
    await sleep(1000);
  }

  const results = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: qid }));
  const rows = results.ResultSet?.Rows ?? [];

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ queryExecutionId: qid, rows }),
  };
};
