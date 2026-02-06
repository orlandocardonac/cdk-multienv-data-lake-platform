import os
import unittest
from unittest.mock import patch

from handlers.query import app


class FakeAthena:
    def start_query_execution(self, **kwargs):
        return {"QueryExecutionId": "Q1"}

    def get_query_execution(self, **kwargs):
        return {"QueryExecution": {"Status": {"State": "SUCCEEDED"}}}

    def get_query_results(self, **kwargs):
        return {"ResultSet": {"Rows": [{"Data": [{"VarCharValue": "x"}]}]}}


class TestQuery(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "ATHENA_WORKGROUP": "wg",
            "ATHENA_DATABASE": "db",
            "ATHENA_OUTPUT": "s3://b/athena-results/",
        },
        clear=True,
    )
    def test_handler(self):
        with patch("boto3.client", return_value=FakeAthena()):
            resp = app.handler({"queryStringParameters": {"service": "auth-api"}}, None)

        self.assertEqual(resp["statusCode"], 200)
        self.assertIn("queryExecutionId", resp["body"])


if __name__ == "__main__":
    unittest.main()
