import unittest
from unittest.mock import Mock

from handlers.process import app


class TestProcess(unittest.TestCase):
    def test_build_processed_key(self):
        raw = "raw/year=2026/month=02/day=05/hour=10/auth-api-10-05_.csv"
        self.assertEqual(
            app.build_processed_key(raw),
            "processed/year=2026/month=02/day=05/hour=10/auth-api-10-05_.parquet",
        )

    def test_copy_and_delete(self):
        s3 = Mock()
        app.copy_and_delete(s3, "b", "raw/x.csv", "processed/x.parquet")

        s3.copy_object.assert_called_once()
        s3.delete_object.assert_called_once_with(Bucket="b", Key="raw/x.csv")


if __name__ == "__main__":
    unittest.main()
