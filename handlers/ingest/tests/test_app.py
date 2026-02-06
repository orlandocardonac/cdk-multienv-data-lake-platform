import os
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock

from handlers.ingest import app


class TestIngest(unittest.TestCase):
    def test_build_raw_key(self):
        now = datetime(2026, 2, 5, 10, 5, 0, tzinfo=timezone.utc)
        key = app.build_raw_key(now, "auth-api")
        self.assertEqual(
            key,
            "raw/year=2026/month=02/day=05/hour=10/auth-api-10-05_.csv",
        )

    def test_put_object_called(self):
        s3 = Mock()

        bucket = "test-bucket"
        key = "raw/year=2026/month=02/day=05/hour=10/auth-api-10-05_.csv"
        body = "timestamp,service,region,requests,errors_5xx,p95_latency,cpu,mem\n"

        app.put_object(s3, bucket, key, body)

        s3.put_object.assert_called_once()
        _, kwargs = s3.put_object.call_args
        self.assertEqual(kwargs["Bucket"], bucket)
        self.assertEqual(kwargs["Key"], key)
        self.assertEqual(kwargs["Body"], body.encode("utf-8"))
        self.assertEqual(kwargs["ContentType"], "text/csv")


if __name__ == "__main__":
    unittest.main()
