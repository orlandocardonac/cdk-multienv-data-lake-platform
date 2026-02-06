import json
import os
import time

from .validator import validator


def _response(status_code: int, body: dict):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def handler(event, context):
    valid = validator(event)
    if valid.get("status") == 400:
        return _response(400, {"message": valid.get("message")})

    workgroup = os.environ.get("ATHENA_WORKGROUP")
    database = os.environ.get("ATHENA_DATABASE")
    output = os.environ.get("ATHENA_OUTPUT")

    if not workgroup or not database or not output:
        raise ValueError("Missing ATHENA_WORKGROUP/ATHENA_DATABASE/ATHENA_OUTPUT")

    qs = (event or {}).get("queryStringParameters") or {}
    service = qs.get("service")

    table = "metrics_processed"
    where = ""
    if service:
        safe = str(service).replace("'", "''")
        where = f" WHERE service = '{safe}'"

    query = f"SELECT * FROM {table}{where} LIMIT 50"

    import boto3

    athena = boto3.client("athena")

    start = athena.start_query_execution(
        WorkGroup=workgroup,
        QueryString=query,
        ResultConfiguration={"OutputLocation": output},
        QueryExecutionContext={"Database": database},
    )

    qid = start.get("QueryExecutionId")
    if not qid:
        raise RuntimeError("Athena did not return QueryExecutionId")

    for _ in range(20):
        exec_resp = athena.get_query_execution(QueryExecutionId=qid)
        state = (((exec_resp.get("QueryExecution") or {}).get("Status") or {}).get("State"))

        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            reason = (((exec_resp.get("QueryExecution") or {}).get("Status") or {}).get("StateChangeReason"))
            raise RuntimeError(f"Athena query {state}: {reason or 'unknown'}")

        time.sleep(1)

    results = athena.get_query_results(QueryExecutionId=qid)
    rows = (((results.get("ResultSet") or {}).get("Rows")) or [])

    return _response(200, {"queryExecutionId": qid, "rows": rows})
