import { S3Client, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { GlueClient, StartCrawlerCommand } from '@aws-sdk/client-glue';

const s3 = new S3Client({});
const glue = new GlueClient({});

type S3EventRecord = {
  s3: {
    bucket: { name: string };
    object: { key: string };
  };
};

type S3Event = {
  Records?: S3EventRecord[];
};

function decodeKey(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, ' '));
}

export const handler = async (event: S3Event): Promise<{ ok: true; processed: number }> => {
  const bucketName = process.env.BUCKET_NAME;
  if (!bucketName) {
    throw new Error('Missing BUCKET_NAME');
  }

  const crawlerName = process.env.GLUE_CRAWLER_NAME;

  const records = event.Records ?? [];
  let processed = 0;

  for (const r of records) {
    const srcBucket = r.s3.bucket.name;
    const srcKey = decodeKey(r.s3.object.key);

    if (srcBucket !== bucketName) {
      continue;
    }
    if (!srcKey.startsWith('raw/')) {
      continue;
    }

    await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: srcKey }));

    const dstKey = srcKey
      .replace(/^raw\//, 'processed/')
      .replace(/\.csv$/, '.parquet');

    await s3.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${bucketName}/${srcKey}`,
        Key: dstKey,
        MetadataDirective: 'REPLACE',
        ContentType: 'application/octet-stream',
        Metadata: { 'mock-parquet': 'true' },
      })
    );

    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: srcKey }));

    processed += 1;
  }

  if (processed > 0 && crawlerName) {
    try {
      await glue.send(new StartCrawlerCommand({ Name: crawlerName }));
    } catch (err: any) {
      const msg = String(err?.name ?? err?.message ?? err);
      if (!msg.includes('CrawlerRunningException')) {
        throw err;
      }
    }
  }

  return { ok: true, processed };
};
