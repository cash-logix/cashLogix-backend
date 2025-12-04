/**
 * In-Memory Cache Service for Cash Logix Backend
 * Provides simple caching with TTL support
 * Can be replaced with Redis in production for distributed caching
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
    
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Generate a cache key from request parameters
   * @param {string} prefix - Cache key prefix (e.g., 'expenses', 'revenues')
   * @param {object} params - Parameters to include in key
   * @returns {string} Cache key
   */
  generateKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Get item from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  /**
   * Set item in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, value, ttl = this.defaultTTL) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  /**
   * Delete item from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Delete all items matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'expenses:')
   */
  deletePattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache for a specific user
   * @param {string} userId - User ID
   * @param {string} prefix - Optional prefix to limit invalidation
   */
  invalidateUser(userId, prefix = '') {
    const pattern = prefix ? `${prefix}:user:${userId}` : `user:${userId}`;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern) || key.includes(`userId:${userId}`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Cache-through helper - get from cache or fetch and cache
   * @param {string} key - Cache key
   * @param {function} fetchFn - Async function to fetch data if not cached
   * @param {number} ttl - Time to live in milliseconds
   * @returns {any} Cached or fetched value
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }
    
    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Destroy the cache service
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Export singleton instance
const cacheService = new CacheService();

// Cache TTL constants (in milliseconds)
const CACHE_TTL = {
  SHORT: 1 * 60 * 1000,      // 1 minute - for frequently changing data
  MEDIUM: 5 * 60 * 1000,     // 5 minutes - default
  LONG: 15 * 60 * 1000,      // 15 minutes - for rarely changing data
  VERY_LONG: 60 * 60 * 1000  // 1 hour - for static data
};

module.exports = { cacheService, CACHE_TTL };

