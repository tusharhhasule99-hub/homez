import type express from 'express';
import multer from 'multer';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sendError } from '../utils/sendResponse';

const DEFAULT_BUCKET_NAME = 'homezy-526123657630-eu-north-1-an';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
});

let cachedS3Client: S3Client | null = null;

function getS3Client(): S3Client {
    if (cachedS3Client) return cachedS3Client;

    const region = process.env.AWS_REGION || 'eu-north-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
        throw new Error('Missing AWS credentials in environment variables.');
    }

    cachedS3Client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
    });
    return cachedS3Client;
}

function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildS3ObjectKey(prefix: string, originalName: string): string {
    const safePrefix = prefix.replace(/^\/+|\/+$/g, '');
    const safeName = sanitizeFileName(originalName);
    return `${safePrefix}/${Date.now()}-${safeName}`;
}

export const parseSingleUpload = (fieldName = 'file') => upload.single(fieldName);

export const uploadSingleFileToS3 = (prefix = 'uploads', bucket = process.env.AWS_S3_BUCKET || DEFAULT_BUCKET_NAME) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        try {
            if (!req.file) {
                return sendError(res, 400, 'No file uploaded', 'VALIDATION');
            }

            const region = process.env.AWS_REGION || 'eu-north-1';
            const key = buildS3ObjectKey(prefix, req.file.originalname);
            const client = getS3Client();

            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                }),
            );

            req.uploadedFile = {
                bucket,
                key,
                url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
                contentType: req.file.mimetype,
                size: req.file.size,
                originalName: req.file.originalname,
            };

            return next();
        } catch (error) {
            console.error('S3 upload failed', error);
            return sendError(res, 500, 'File upload failed', 'UPLOAD_FAILED');
        }
    };
};
