import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function buildRawKey(now: Date, serviceName: string): string {
  const year = now.getUTCFullYear();
  const month = pad2(now.getUTCMonth() + 1);
  const day = pad2(now.getUTCDate());
  const hour = pad2(now.getUTCHours());
  const minute = pad2(now.getUTCMinutes());

  return `raw/year=${year}/month=${month}/day=${day}/hour=${hour}/${serviceName}-${hour}-${minute}_.csv`;
}

export const handler = async (): Promise<{ ok: true; key: string }> => {
  const bucketName = process.env.BUCKET_NAME;
  if (!bucketName) {
    throw new Error('Missing BUCKET_NAME');
  }

  const now = new Date();
  const service = 'auth-api';
  const region = process.env.AWS_REGION ?? 'us-east-1';

  const requests = Math.floor(9000 + Math.random() * 3000);
  const errors5xx = Math.floor(Math.random() * 50);
  const p95Latency = Math.floor(100 + Math.random() * 800);
  const cpu = Math.floor(10 + Math.random() * 80);
  const mem = Math.floor(10 + Math.random() * 80);

  const header = 'timestamp,service,region,requests,errors_5xx,p95_latency,cpu,mem\n';
  const row = `${now.toISOString()},${service},${region},${requests},${errors5xx},${p95Latency},${cpu},${mem}\n`;

  const key = buildRawKey(now, service);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: header + row,
      ContentType: 'text/csv',
    })
  );

  return { ok: true, key };
};
