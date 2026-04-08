import type { AccessTokenPayload, StaffAccessTokenPayload } from '../utils/authToken';

declare global {
    namespace Express {
        interface UploadedS3File {
            bucket: string;
            key: string;
            url: string;
            contentType: string;
            size: number;
            originalName: string;
        }

        interface Request {
            auth?: AccessTokenPayload;
            staffAuth?: StaffAccessTokenPayload;
            file?: Multer.File;
            uploadedFile?: UploadedS3File;
        }
    }
}

export {};
