import crypto from 'crypto';
import { CONFIG } from '../config/constants';
import { logger } from '../utils/logger';

export interface CacheItem {
  data: any;
  timestamp: number;
  size: number;
}

export interface CacheStats {
  totalSize: number;
  itemCount: number;
  maxSize: number;
  totalSizeMB: number;
  maxSizeMB: number;
}

export class MemoryCache {
  private cache: Map<string, CacheItem> = new Map();
  private totalSize: number = 0;
  private readonly maxSize: number = CONFIG.CACHE_MAX_SIZE;
  private readonly maxAge: number = CONFIG.CACHE_MAX_AGE;

  // 计算对象大小（粗略估算）
  private calculateSize(obj: any): number {
    try {
      const str = JSON.stringify(obj);
      return Buffer.byteLength(str, 'utf8');
    } catch {
      return 1024; // 默认1KB
    }
  }

  // 生成缓存键
  private generateKey(url: string, params: any): string {
    // 对参数进行排序，确保相同参数的不同顺序生成相同的键
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    return crypto.createHash('md5').update(`${url}${sortedParams}`).digest('hex');
  }

  // 清理过期缓存
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.maxAge) {
        this.totalSize -= value.size;
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired cache items`);
    }
  }

  // 清理到指定大小
  private evictToSize(targetSize: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp); // 按时间排序，先删除旧的

    let evictedCount = 0;
    for (const [key, value] of entries) {
      if (this.totalSize <= targetSize) break;
      this.totalSize -= value.size;
      this.cache.delete(key);
      evictedCount++;
    }
    
    if (evictedCount > 0) {
      logger.debug(`Evicted ${evictedCount} cache items to free space`);
    }
  }

  // 设置缓存
  set(url: string, params: any, data: any): void {
    const key = this.generateKey(url, params);
    const size = this.calculateSize(data);
    
    // 如果单个缓存项超过最大限制，直接跳过
    if (size > this.maxSize) {
      logger.warn(`Cache item too large (${size} bytes), skipping cache`, { url });
      return;
    }

    // 清理过期缓存
    this.cleanup();

    // 如果添加这个缓存项会超过限制，先清理空间
    if (this.totalSize + size > this.maxSize) {
      const targetSize = this.maxSize - size;
      this.evictToSize(targetSize);
    }

    // 如果清理后仍然超过限制，跳过缓存
    if (this.totalSize + size > this.maxSize) {
      logger.warn(`Insufficient cache space, skipping cache`, { 
        current: this.totalSize, 
        needed: size,
        url 
      });
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      size
    });
    this.totalSize += size;

    logger.debug(`Cache set successfully`, { 
      url, 
      size, 
      totalSize: this.totalSize,
      key 
    });
  }

  // 获取缓存
  get(url: string, params: any): any | null {
    const key = this.generateKey(url, params);
    const cached = this.cache.get(key);
    
    if (!cached) {
      logger.debug(`Cache miss`, { url, key });
      return null;
    }

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.totalSize -= cached.size;
      this.cache.delete(key);
      logger.debug(`Cache expired`, { url });
      return null;
    }

    logger.debug(`Cache hit`, { url, key });
    return cached.data;
  }

  // 获取缓存统计信息
  getStats(): CacheStats {
    return {
      totalSize: this.totalSize,
      itemCount: this.cache.size,
      maxSize: this.maxSize,
      totalSizeMB: Math.round(this.totalSize / (1024 * 1024) * 100) / 100,
      maxSizeMB: Math.round(this.maxSize / (1024 * 1024) * 100) / 100
    };
  }

  // 清空缓存
  clear(): void {
    const itemCount = this.cache.size;
    this.cache.clear();
    this.totalSize = 0;
    logger.info(`Cache cleared`, { itemCount });
  }

  // 获取缓存项数量
  getItemCount(): number {
    return this.cache.size;
  }

  // 获取缓存总大小
  getTotalSize(): number {
    return this.totalSize;
  }
}

// 创建全局缓存实例
export const memoryCache = new MemoryCache();

// 封装带缓存的 GET 请求
export async function cachedFetchGet(url: string, options: any = {}): Promise<any> {
  const params = {
    url,
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || undefined,
  };
  
  // 查缓存
  const cached = memoryCache.get(url, params);
  if (cached) {
    return { ok: true, fromCache: true, data: cached.data };
  }
  
  // 发起 GET 请求
  const { fetchWithRetry } = await import('../utils/fetch');
  const response = await fetchWithRetry(url, { ...options, method: 'GET' });
  const data = await response.json();
  
  // 只缓存成功状态的请求
  if (response.ok) {
    memoryCache.set(url, params, { 
      data, 
      status: response.status, 
      headers: { 'content-type': response.headers.get('content-type') } 
    });
  }
  
  return { ok: response.ok, fromCache: false, data };
} 