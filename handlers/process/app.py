import os
import urllib.parse


def decode_key(key: str) -> str:
    return urllib.parse.unquote_plus(key)


def build_processed_key(raw_key: str) -> str:
    return raw_key.replace("raw/", "processed/", 1).rsplit(".", 1)[0] + ".parquet"


def copy_and_delete(s3_client, bucket: str, src_key: str, dst_key: str) -> None:
    s3_client.copy_object(
        Bucket=bucket,
        CopySource={"Bucket": bucket, "Key": src_key},
        Key=dst_key,
        MetadataDirective="REPLACE",
        ContentType="application/octet-stream",
        Metadata={"mock-parquet": "true"},
    )
    s3_client.delete_object(Bucket=bucket, Key=src_key)


def start_crawler(glue_client, crawler_name: str) -> None:
    try:
        glue_client.start_crawler(Name=crawler_name)
    except Exception as exc:  # pragma: no cover
        msg = str(getattr(exc, "response", "") or exc)
        if "CrawlerRunningException" not in msg:
            raise


def handler(event, context):
    bucket = os.environ.get("BUCKET_NAME")
    if not bucket:
        raise ValueError("Missing BUCKET_NAME")

    crawler_name = os.environ.get("GLUE_CRAWLER_NAME")

    import boto3

    s3_client = boto3.client("s3")
    glue_client = boto3.client("glue")

    processed = 0

    for record in event.get("Records", []) or []:
        s3_info = record.get("s3", {})
        src_bucket = (s3_info.get("bucket") or {}).get("name")
        src_key = decode_key(((s3_info.get("object") or {}).get("key")) or "")

        if src_bucket != bucket:
            continue
        if not src_key.startswith("raw/"):
            continue

        dst_key = build_processed_key(src_key)
        copy_and_delete(s3_client, bucket, src_key, dst_key)
        processed += 1

    if processed > 0 and crawler_name:
        start_crawler(glue_client, crawler_name)

    return {"ok": True, "processed": processed}
