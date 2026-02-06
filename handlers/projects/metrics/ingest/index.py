import json
import os
import random
from datetime import datetime, timezone

from .validator import validator


def _pad2(n: int) -> str:
    return str(n).zfill(2)


def build_raw_key(now: datetime, service_name: str) -> str:
    year = now.year
    month = _pad2(now.month)
    day = _pad2(now.day)
    hour = _pad2(now.hour)
    minute = _pad2(now.minute)

    return (
        f"raw/year={year}/month={month}/day={day}/hour={hour}/"
        f"{service_name}-{hour}-{minute}_.csv"
    )


def build_csv(now: datetime, service: str, region: str) -> str:
    requests = int(9000 + random.random() * 3000)
    errors_5xx = int(random.random() * 50)
    p95_latency = int(100 + random.random() * 800)
    cpu = int(10 + random.random() * 80)
    mem = int(10 + random.random() * 80)

    header = "timestamp,service,region,requests,errors_5xx,p95_latency,cpu,mem\n"
    ts = now.isoformat().replace("+00:00", "Z")
    row = f"{ts},{service},{region},{requests},{errors_5xx},{p95_latency},{cpu},{mem}\n"
    return header + row


def put_object(s3_client, bucket: str, key: str, body: str) -> None:
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType="text/csv",
    )


def handler(event, context):
    valid = validator(event)
    if valid.get("status") == 400:
        return {"statusCode": 400, "body": json.dumps({"message": valid.get("message")})}

    bucket = os.environ.get("BUCKET_NAME")
    if not bucket:
        raise ValueError("Missing BUCKET_NAME")

    now = datetime.now(timezone.utc)
    service = "auth-api"
    region = os.environ.get("AWS_REGION", "us-east-1")

    key = build_raw_key(now, service)
    body = build_csv(now, service, region)

    import boto3

    s3_client = boto3.client("s3")
    put_object(s3_client, bucket, key, body)

    return {"ok": True, "key": key}
