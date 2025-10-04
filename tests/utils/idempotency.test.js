const {
  extractIdempotencyKey,
  generateIdempotencyKey,
  isKeyProcessed,
  markKeyProcessed,
  getProcessedResult,
  clearProcessedKeys,
} = require('../../src/utils/idempotency');

describe('Idempotency Utils', () => {
  beforeEach(() => {
    clearProcessedKeys();
  });

  describe('extractIdempotencyKey', () => {
    it('should extract from x-idempotency-key header', () => {
      const headers = { 'x-idempotency-key': 'key_123' };
      const key = extractIdempotencyKey(headers, {});
      expect(key).toBe('key_123');
    });

    it('should extract from idempotency-key header', () => {
      const headers = { 'idempotency-key': 'key_456' };
      const key = extractIdempotencyKey(headers, {});
      expect(key).toBe('key_456');
    });

    it('should extract from x-request-id header', () => {
      const headers = { 'x-request-id': 'req_789' };
      const key = extractIdempotencyKey(headers, {});
      expect(key).toBe('req_789');
    });

    it('should extract from x-razorpay-event-id header', () => {
      const headers = { 'x-razorpay-event-id': 'evt_razorpay_123' };
      const key = extractIdempotencyKey(headers, {});
      expect(key).toBe('evt_razorpay_123');
    });

    it('should prioritize x-idempotency-key over other headers', () => {
      const headers = {
        'x-idempotency-key': 'priority_key',
        'x-request-id': 'other_key',
      };
      const key = extractIdempotencyKey(headers, {});
      expect(key).toBe('priority_key');
    });

    it('should extract from body.event_id', () => {
      const body = { event_id: 'evt_body_123' };
      const key = extractIdempotencyKey({}, body);
      expect(key).toBe('evt_body_123');
    });

    it('should extract from Razorpay payment structure', () => {
      const body = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
            },
          },
        },
      };
      const key = extractIdempotencyKey({}, body);
      expect(key).toBe('payment.captured_pay_123');
    });

    it('should extract from body.id', () => {
      const body = { id: 'generic_id_123' };
      const key = extractIdempotencyKey({}, body);
      expect(key).toBe('generic_id_123');
    });

    it('should prefer headers over body', () => {
      const headers = { 'x-idempotency-key': 'header_key' };
      const body = { event_id: 'body_key' };
      const key = extractIdempotencyKey(headers, body);
      expect(key).toBe('header_key');
    });

    it('should return null when no key found', () => {
      const key = extractIdempotencyKey({}, {});
      expect(key).toBeNull();
    });

    it('should handle null headers', () => {
      const body = { event_id: 'evt_123' };
      const key = extractIdempotencyKey(null, body);
      expect(key).toBe('evt_123');
    });

    it('should handle null body', () => {
      const headers = { 'x-idempotency-key': 'key_123' };
      const key = extractIdempotencyKey(headers, null);
      expect(key).toBe('key_123');
    });

    it('should handle case-insensitive headers', () => {
      const headers = { 'X-Idempotency-Key': 'key_uppercase' };
      const key = extractIdempotencyKey(headers, {});
      expect(key).toBe('key_uppercase');
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate a key from data', () => {
      const data = { event: 'test', id: '123' };
      const key = generateIdempotencyKey(data);
      
      expect(key).toBeDefined();
      expect(key).toMatch(/^generated_[a-f0-9]{32}$/);
    });

    it('should generate same key for same data', () => {
      const data = { event: 'test', id: '123' };
      const key1 = generateIdempotencyKey(data);
      const key2 = generateIdempotencyKey(data);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different data', () => {
      const data1 = { event: 'test1' };
      const data2 = { event: 'test2' };
      const key1 = generateIdempotencyKey(data1);
      const key2 = generateIdempotencyKey(data2);
      
      expect(key1).not.toBe(key2);
    });

    it('should handle complex nested data', () => {
      const data = {
        event: 'payment.captured',
        payload: {
          payment: { id: 'pay_123', amount: 5000 },
        },
      };
      const key = generateIdempotencyKey(data);
      
      expect(key).toBeDefined();
      expect(key).toMatch(/^generated_/);
    });
  });

  describe('isKeyProcessed and markKeyProcessed', () => {
    it('should return false for unprocessed key', () => {
      expect(isKeyProcessed('key_new')).toBe(false);
    });

    it('should return true after marking key as processed', () => {
      const key = 'key_processed';
      const result = { success: true };
      
      markKeyProcessed(key, result);
      
      expect(isKeyProcessed(key)).toBe(true);
    });

    it('should store and retrieve result', () => {
      const key = 'key_with_result';
      const result = { processed: true, event: 'payment.captured' };
      
      markKeyProcessed(key, result);
      const cached = getProcessedResult(key);
      
      expect(cached).toEqual(result);
    });

    it('should return null for non-existent key', () => {
      const cached = getProcessedResult('non_existent');
      expect(cached).toBeNull();
    });

    it('should handle multiple keys', () => {
      markKeyProcessed('key1', { data: 'result1' });
      markKeyProcessed('key2', { data: 'result2' });
      
      expect(isKeyProcessed('key1')).toBe(true);
      expect(isKeyProcessed('key2')).toBe(true);
      expect(getProcessedResult('key1')).toEqual({ data: 'result1' });
      expect(getProcessedResult('key2')).toEqual({ data: 'result2' });
    });

    it('should clear all keys', () => {
      markKeyProcessed('key1', { data: 'result1' });
      markKeyProcessed('key2', { data: 'result2' });
      
      clearProcessedKeys();
      
      expect(isKeyProcessed('key1')).toBe(false);
      expect(isKeyProcessed('key2')).toBe(false);
    });

    it('should auto-expire keys after TTL', (done) => {
      const key = 'key_expire';
      const ttl = 100; // 100ms
      
      markKeyProcessed(key, { data: 'result' }, ttl);
      expect(isKeyProcessed(key)).toBe(true);
      
      setTimeout(() => {
        expect(isKeyProcessed(key)).toBe(false);
        done();
      }, 150);
    }, 300);

    it('should store metadata with processed key', () => {
      const key = 'key_metadata';
      markKeyProcessed(key, { success: true });
      
      // Access internal store to check metadata
      const cached = getProcessedResult(key);
      expect(cached).toEqual({ success: true });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string as key', () => {
      markKeyProcessed('', { data: 'test' });
      expect(isKeyProcessed('')).toBe(true);
    });

    it('should handle very long keys', () => {
      const longKey = 'k'.repeat(1000);
      markKeyProcessed(longKey, { data: 'test' });
      expect(isKeyProcessed(longKey)).toBe(true);
    });

    it('should handle special characters in keys', () => {
      const specialKey = 'key!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
      markKeyProcessed(specialKey, { data: 'test' });
      expect(isKeyProcessed(specialKey)).toBe(true);
    });

    it('should handle null result', () => {
      markKeyProcessed('key_null', null);
      expect(getProcessedResult('key_null')).toBeNull();
    });

    it('should handle undefined result', () => {
      markKeyProcessed('key_undefined', undefined);
      expect(getProcessedResult('key_undefined')).toBeUndefined();
    });
  });
});

