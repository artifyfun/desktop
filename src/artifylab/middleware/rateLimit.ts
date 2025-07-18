import { Request, Response, NextFunction } from 'express';
import { CONFIG, ERROR_MESSAGES, HTTP_STATUS } from '../config/constants';
import { logger } from '../utils/logger';

export interface RateLimitInfo {
  limited: boolean;
  requestCount: number;
  remainingRequests: number;
  clientIp: string;
}

// 扩展 Request 接口和 globalThis
declare global {
  namespace Express {
    interface Request {
      rateLimit?: RateLimitInfo;
    }
  }
  
  var ipCacheCleanupInterval: NodeJS.Timeout | undefined;
}

// 用于存储IP访问记录的缓存
const ipRequestCache: Record<string, number[]> = {};

// 静态资源路径模式
const STATIC_RESOURCE_PATTERNS = [
  /^\/assets\//,
  /\.(js|css|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i
];

// 检查是否为静态资源请求
function isStaticResource(path: string): boolean {
  return STATIC_RESOURCE_PATTERNS.some(pattern => pattern.test(path));
}

// 获取客户端真实IP
function getClientIp(req: Request): string {
  return req.headers['x-forwarded-for'] as string ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         '';
}

// 清理过期的IP记录
function cleanupExpiredRecords(): void {
  const cleanupTime = Date.now() - CONFIG.RATE_LIMIT_WINDOW;
  let cleanedCount = 0;
  
  for (const ip in ipRequestCache) {
    const originalLength = ipRequestCache[ip].length;
    ipRequestCache[ip] = ipRequestCache[ip].filter(timestamp => timestamp > cleanupTime);
    
    // 如果没有记录，删除该IP的缓存
    if (ipRequestCache[ip].length === 0) {
      delete ipRequestCache[ip];
      cleanedCount++;
    } else if (ipRequestCache[ip].length !== originalLength) {
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    logger.debug(`IP cache cleanup completed`, { 
      cleanedCount, 
      activeIPs: Object.keys(ipRequestCache).length 
    });
  }
}

// 设置定期清理任务
function setupCleanupTask(): void {
  if (!globalThis.ipCacheCleanupInterval) {
    globalThis.ipCacheCleanupInterval = setInterval(cleanupExpiredRecords, CONFIG.RATE_LIMIT_WINDOW);
    logger.info('Rate limit cleanup task started');
  }
}

// 限流中间件
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 如果未配置限制或限制值<=0，则跳过限流检查
  if (CONFIG.IP_RATE_LIMIT <= 0) {
    req.rateLimit = { 
      limited: false, 
      requestCount: 0, 
      remainingRequests: 0, 
      clientIp: getClientIp(req) 
    };
    return next();
  }

  const clientIp = getClientIp(req);

  // 静态资源请求不计入限制
  if (isStaticResource(req.path)) {
    req.rateLimit = { 
      limited: false, 
      requestCount: 0, 
      remainingRequests: 0, 
      clientIp 
    };
    return next();
  }

  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;

  // 初始化IP记录
  if (!ipRequestCache[clientIp]) {
    ipRequestCache[clientIp] = [];
  }

  // 清理窗口外的请求记录
  ipRequestCache[clientIp] = ipRequestCache[clientIp].filter(timestamp => timestamp > windowStart);

  // 计算当前请求数和剩余请求数
  const requestCount = ipRequestCache[clientIp].length;
  const remainingRequests = CONFIG.IP_RATE_LIMIT - requestCount;

  // 将限流信息添加到请求对象中
  req.rateLimit = {
    limited: requestCount >= CONFIG.IP_RATE_LIMIT,
    requestCount,
    remainingRequests,
    clientIp
  };

  // 检查是否超过限制
  if (req.rateLimit.limited) {
    // 找出最早的请求时间，计算何时可以再次请求
    const oldestRequest = Math.min(...ipRequestCache[clientIp]);
    const resetTime = oldestRequest + CONFIG.RATE_LIMIT_WINDOW;
    const waitTimeMs = resetTime - now;
    const waitTimeMinutes = Math.ceil(waitTimeMs / 60_000); // 转换为分钟并向上取整

    // 获取客户端可能的语言设置
    const clientLang = req.headers['accept-language'] || 'en';
    const isZhClient = clientLang.toLowerCase().includes('zh');

    logger.warn(`Rate limit exceeded`, { 
      clientIp, 
      requestCount, 
      limit: CONFIG.IP_RATE_LIMIT,
      waitTimeMinutes 
    });

    // 根据语言返回合适的消息
    const messageTemplate = isZhClient 
      ? ERROR_MESSAGES.RATE_LIMIT_EXCEEDED.zh 
      : ERROR_MESSAGES.RATE_LIMIT_EXCEEDED.en;
    
    const message = messageTemplate.replace('{minutes}', waitTimeMinutes.toString());

    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      ok: false,
      message,
      waitTimeMinutes,
      resetTime
    });
    return;
  }

  // 记录本次请求时间戳
  ipRequestCache[clientIp].push(now);

  // 设置定期清理任务
  setupCleanupTask();

  // 记录请求日志
  logger.debug(`Rate limit check passed`, {
    clientIp,
    requestCount: req.rateLimit.requestCount,
    remainingRequests: req.rateLimit.remainingRequests,
    path: req.path
  });

  next();
}

// 获取限流统计信息
export function getRateLimitStats(): {
  activeIPs: number;
  totalRequests: number;
  rateLimitEnabled: boolean;
} {
  const activeIPs = Object.keys(ipRequestCache).length;
  const totalRequests = Object.values(ipRequestCache).reduce((sum, requests) => sum + requests.length, 0);
  
  return {
    activeIPs,
    totalRequests,
    rateLimitEnabled: CONFIG.IP_RATE_LIMIT > 0
  };
}

// 清空限流缓存
export function clearRateLimitCache(): void {
  const itemCount = Object.keys(ipRequestCache).length;
  Object.keys(ipRequestCache).forEach(key => delete ipRequestCache[key]);
  logger.info(`Rate limit cache cleared`, { itemCount });
} 