// api/presign.js — Vercel/Netlify serverless function.
// Returns a presigned PUT URL for MinIO/S3 upload (metadata JSON for minted NFTs).
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_USER || 'minioadmin',
    secretAccessKey: process.env.MINIO_PASS || 'minioadmin',
  },
});

const DEFAULT_BUCKET = process.env.MINT_BUCKET || 'terp-mint';
const EXPIRES_IN = 3600; // 1 hour.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const bucket = url.searchParams.get('bucket') || DEFAULT_BUCKET;
  const key = url.searchParams.get('key') || `mints/${crypto.randomUUID()}.json`;

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: 'application/json',
    });
    const presignUrl = await getSignedUrl(s3, command, { expiresIn: EXPIRES_IN });
    res.json({ presign_url: presignUrl, key, bucket });
  } catch (err) {
    console.error('Presign error:', err);
    res.status(500).json({ error: err.message });
  }
}
