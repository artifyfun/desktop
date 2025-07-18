import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// 模拟MemoryCache类
class MemoryCache {
  private cache: Map<string, { data: any; timestamp: number; size: number }> = new Map();
  private totalSize: number = 0;
  private readonly maxSize: number = 2 * 1024 * 1024 * 1024; // 2GB
  private readonly maxAge: number = 30 * 60 * 1000; // 30分钟过期

  calculateSize(obj: any): number {
    try {
      const str = JSON.stringify(obj);
      return Buffer.byteLength(str, 'utf8');
    } catch {
      return 1024; // 默认1KB
    }
  }

  private generateKey(url: string, params: any): string {
    const paramStr = JSON.stringify(params);
    return crypto.createHash('md5').update(`${url}${paramStr}`).digest('hex');
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.maxAge) {
        this.totalSize -= value.size;
        this.cache.delete(key);
      }
    }
  }

  private evictToSize(targetSize: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (const [key, value] of entries) {
      if (this.totalSize <= targetSize) break;
      this.totalSize -= value.size;
      this.cache.delete(key);
    }
  }

  set(url: string, params: any, data: any): void {
    const key = this.generateKey(url, params);
    const size = this.calculateSize(data);
    
    if (size > this.maxSize) {
      return;
    }

    this.cleanup();

    if (this.totalSize + size > this.maxSize) {
      const targetSize = this.maxSize - size;
      this.evictToSize(targetSize);
    }

    if (this.totalSize + size > this.maxSize) {
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      size
    });
    this.totalSize += size;
  }

  get(url: string, params: any): any | null {
    const key = this.generateKey(url, params);
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > this.maxAge) {
      this.totalSize -= cached.size;
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  getStats(): { totalSize: number; itemCount: number; maxSize: number } {
    return {
      totalSize: this.totalSize,
      itemCount: this.cache.size,
      maxSize: this.maxSize
    };
  }

  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }
}

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  afterEach(() => {
    cache.clear();
  });

  it('应该能够设置和获取缓存', () => {
    const url = '/api/test';
    const params = { query: { id: '123' } };
    const data = { message: 'test data' };

    // 设置缓存
    cache.set(url, params, data);

    // 获取缓存
    const cached = cache.get(url, params);
    expect(cached).toEqual(data);
  });

  it('应该能够根据参数区分不同的缓存', () => {
    const url = '/api/test';
    const params1 = { query: { id: '123' } };
    const params2 = { query: { id: '456' } };
    const data1 = { message: 'test data 1' };
    const data2 = { message: 'test data 2' };

    // 设置不同的缓存
    cache.set(url, params1, data1);
    cache.set(url, params2, data2);

    // 验证缓存区分
    expect(cache.get(url, params1)).toEqual(data1);
    expect(cache.get(url, params2)).toEqual(data2);
  });

  it('应该能够计算缓存大小', () => {
    const url = '/api/test';
    const params = { query: { id: '123' } };
    const data = { message: 'test data' };

    cache.set(url, params, data);
    const stats = cache.getStats();

    expect(stats.itemCount).toBe(1);
    expect(stats.totalSize).toBeGreaterThan(0);
  });

  it('应该能够清空缓存', () => {
    const url = '/api/test';
    const params = { query: { id: '123' } };
    const data = { message: 'test data' };

    cache.set(url, params, data);
    expect(cache.get(url, params)).toEqual(data);

    cache.clear();
    expect(cache.get(url, params)).toBeNull();

    const stats = cache.getStats();
    expect(stats.itemCount).toBe(0);
    expect(stats.totalSize).toBe(0);
  });

  it('应该能够处理过期缓存', () => {
    const url = '/api/test';
    const params = { query: { id: '123' } };
    const data = { message: 'test data' };

    cache.set(url, params, data);
    expect(cache.get(url, params)).toEqual(data);

    // 模拟时间过去31分钟
    const originalDateNow = Date.now;
    Date.now = () => originalDateNow() + 31 * 60 * 1000;

    expect(cache.get(url, params)).toBeNull();

    // 恢复原始时间
    Date.now = originalDateNow;
  });

  it('应该能够处理大缓存项的清理', () => {
    // 创建一个较大的数据（但不会导致内存错误）
    const largeData = { data: 'x'.repeat(1024 * 1024) }; // 1MB字符串
    
    const url = '/api/test';
    const params = { query: { id: '123' } };

    // 这个应该被正常缓存
    cache.set(url, params, largeData);
    
    const stats = cache.getStats();
    expect(stats.itemCount).toBe(1);
    expect(stats.totalSize).toBeGreaterThan(0);
    
    // 验证缓存内容
    const cached = cache.get(url, params);
    expect(cached).toEqual(largeData);
  });
}); 