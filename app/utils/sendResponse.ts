import express from 'express';

export const sendSuccess = (res: express.Response, statusCode: number, message: string, data?: any) => {
    return res.status(statusCode).json({
        message,
        data,
        success: true,
    });
};

export const sendError = (res: express.Response, statusCode: number, message: string, code?: string) => {
    return res.status(statusCode).json({
        message,
        code,
        success: false,
    });
};