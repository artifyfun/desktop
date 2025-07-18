import { ERROR_MESSAGES, HTTP_STATUS } from '../config/constants';
import { logger } from './logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export class CustomError extends Error implements ApiError {
  public statusCode: number;
  public code?: string;

  constructor(message: string, statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function isConnectionTimeoutError(error: any): boolean {
  return error.code === 'UND_ERR_CONNECT_TIMEOUT' || 
         (error.message && error.message.includes('UND_ERR_CONNECT_TIMEOUT'));
}

export function isRateLimitError(error: any): boolean {
  return error.message && error.message.includes('exceeded your monthly included credits');
}

export function handleApiError(error: any, res: any): void {
  logger.error('API Error occurred', { error: error.message, stack: error.stack });

  // 检查是否已经发送了响应
  if (res.headersSent) {
    logger.warn('Response headers already sent, cannot send error response');
    return;
  }

  // 处理连接超时错误
  if (isConnectionTimeoutError(error)) {
    res.status(HTTP_STATUS.GATEWAY_TIMEOUT).json({
      ok: false,
      message: ERROR_MESSAGES.CONNECTION_TIMEOUT
    });
    return;
  }

  // 处理额度超限错误
  if (isRateLimitError(error)) {
    res.status(HTTP_STATUS.PAYMENT_REQUIRED).json({
      ok: false,
      openProModal: true,
      message: error.message,
    });
    return;
  }

  // 处理自定义错误
  if (error instanceof CustomError) {
    res.status(error.statusCode).json({
      ok: false,
      message: error.message
    });
    return;
  }

  // 处理其他错误
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    ok: false,
    message: error.message || "An error occurred while processing your request."
  });
}

export function createErrorResponse(message: string, statusCode: number = HTTP_STATUS.BAD_REQUEST) {
  return {
    ok: false,
    message
  };
}

export function createSuccessResponse(data?: any, message?: string) {
  return {
    ok: true,
    ...(data && { data }),
    ...(message && { message })
  };
} 