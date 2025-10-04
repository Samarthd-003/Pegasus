const crypto = require('crypto');
const {
  verifyRazorpaySignature,
  clearPayments,
} = require('../../src/services/paymentService');
const { SignatureVerificationError, ValidationError } = require('../../src/utils/errors');

describe('PaymentService - Enhanced Signature Verification', () => {
  const webhookSecret = 'test_webhook_secret_12345';
  const webhookBody = JSON.stringify({ 
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_123' } } }
  });

  beforeEach(() => {
    clearPayments();
    // Reset NODE_ENV to test
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  describe('Valid Signature Verification', () => {
    it('should verify valid HMAC-SHA256 signature', () => {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookBody)
        .digest('hex');

      const result = verifyRazorpaySignature(webhookBody, signature, webhookSecret);
      expect(result).toBe(true);
    });

    it('should verify signature with special characters in body', () => {
      const specialBody = JSON.stringify({ 
        data: 'Test with special chars: !@#$%^&*()_+-=[]{}|;:\'",.<>?/`~' 
      });
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(specialBody)
        .digest('hex');

      const result = verifyRazorpaySignature(specialBody, signature, webhookSecret);
      expect(result).toBe(true);
    });

    it('should verify signature with unicode characters', () => {
      const unicodeBody = JSON.stringify({ 
        message: '测试 🚀 مرحبا Тест' 
      });
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(unicodeBody)
        .digest('hex');

      const result = verifyRazorpaySignature(unicodeBody, signature, webhookSecret);
      expect(result).toBe(true);
    });

    it('should verify signature with large payload', () => {
      const largeBody = JSON.stringify({ 
        data: 'x'.repeat(10000) 
      });
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(largeBody)
        .digest('hex');

      const result = verifyRazorpaySignature(largeBody, signature, webhookSecret);
      expect(result).toBe(true);
    });
  });

  describe('Invalid Signature Detection', () => {
    it('should throw SignatureVerificationError for invalid signature', () => {
      const invalidSignature = crypto
        .createHmac('sha256', 'wrong_secret')
        .update(webhookBody)
        .digest('hex');

      expect(() => {
        verifyRazorpaySignature(webhookBody, invalidSignature, webhookSecret);
      }).toThrow(SignatureVerificationError);
    });

    it('should throw error with correct context on signature mismatch', () => {
      const invalidSignature = crypto
        .createHmac('sha256', 'wrong_secret')
        .update(webhookBody)
        .digest('hex');

      try {
        verifyRazorpaySignature(webhookBody, invalidSignature, webhookSecret);
        fail('Should have thrown SignatureVerificationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SignatureVerificationError);
        expect(error.context).toBeDefined();
        expect(error.context.reason).toBe('signature_mismatch');
        expect(error.context.hasBody).toBe(true);
        expect(error.context.hasSignature).toBe(true);
      }
    });

    it('should throw error for tampered body', () => {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookBody)
        .digest('hex');

      const tamperedBody = webhookBody + ' modified';

      expect(() => {
        verifyRazorpaySignature(tamperedBody, signature, webhookSecret);
      }).toThrow(SignatureVerificationError);
    });

    it('should throw error for completely wrong signature format', () => {
      const wrongSignature = 'this_is_not_a_valid_hex_signature_123';

      expect(() => {
        verifyRazorpaySignature(webhookBody, wrongSignature, webhookSecret);
      }).toThrow(SignatureVerificationError);
    });
  });

  describe('Missing or Invalid Parameters', () => {
    it('should throw ValidationError when body is null', () => {
      const signature = 'abc123';

      expect(() => {
        verifyRazorpaySignature(null, signature, webhookSecret);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError when body is undefined', () => {
      const signature = 'abc123';

      expect(() => {
        verifyRazorpaySignature(undefined, signature, webhookSecret);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError when body is not a string', () => {
      const signature = 'abc123';

      expect(() => {
        verifyRazorpaySignature({ event: 'test' }, signature, webhookSecret);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError with context when body is empty string', () => {
      const signature = 'abc123';

      try {
        verifyRazorpaySignature('', signature, webhookSecret);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.context.reason).toBe('invalid_body');
      }
    });

    it('should throw SignatureVerificationError when signature is missing', () => {
      expect(() => {
        verifyRazorpaySignature(webhookBody, null, webhookSecret);
      }).toThrow(SignatureVerificationError);
    });

    it('should throw SignatureVerificationError when signature is empty', () => {
      expect(() => {
        verifyRazorpaySignature(webhookBody, '', webhookSecret);
      }).toThrow(SignatureVerificationError);
    });

    it('should throw error with context when signature is missing', () => {
      try {
        verifyRazorpaySignature(webhookBody, null, webhookSecret);
        fail('Should have thrown SignatureVerificationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SignatureVerificationError);
        expect(error.context.reason).toBe('missing_signature');
      }
    });
  });

  describe('Secret Configuration', () => {
    it('should return true in development mode when secret is not configured', () => {
      process.env.NODE_ENV = 'development';
      
      const result = verifyRazorpaySignature(webhookBody, 'any_signature', null);
      expect(result).toBe(true);
    });

    it('should throw ValidationError in production when secret is not configured', () => {
      process.env.NODE_ENV = 'production';

      expect(() => {
        verifyRazorpaySignature(webhookBody, 'signature', null);
      }).toThrow(ValidationError);
    });

    it('should include environment in error context when secret missing in production', () => {
      process.env.NODE_ENV = 'production';

      try {
        verifyRazorpaySignature(webhookBody, 'signature', null);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.context.reason).toBe('missing_secret');
        expect(error.context.environment).toBe('production');
      }
    });
  });

  describe('Signature Format Validation', () => {
    it('should throw error for non-hex signature', () => {
      const nonHexSignature = 'this-is-not-hex!@#$';

      expect(() => {
        verifyRazorpaySignature(webhookBody, nonHexSignature, webhookSecret);
      }).toThrow(SignatureVerificationError);
    });

    it('should throw error with format context for invalid signature', () => {
      const nonHexSignature = 'GHIJKLMNOP'; // Contains non-hex characters

      try {
        verifyRazorpaySignature(webhookBody, nonHexSignature, webhookSecret);
        fail('Should have thrown SignatureVerificationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SignatureVerificationError);
        expect(error.context.reason).toBe('invalid_format');
      }
    });

    it('should accept lowercase hex signatures', () => {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookBody)
        .digest('hex');

      const result = verifyRazorpaySignature(webhookBody, signature.toLowerCase(), webhookSecret);
      expect(result).toBe(true);
    });

    it('should accept uppercase hex signatures', () => {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookBody)
        .digest('hex');

      const result = verifyRazorpaySignature(webhookBody, signature.toUpperCase(), webhookSecret);
      expect(result).toBe(true);
    });
  });

  describe('Length Mismatch Detection', () => {
    it('should throw error when signature length is too short', () => {
      const shortSignature = 'abc123';

      expect(() => {
        verifyRazorpaySignature(webhookBody, shortSignature, webhookSecret);
      }).toThrow(SignatureVerificationError);
    });

    it('should throw error when signature length is too long', () => {
      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookBody)
        .digest('hex');
      const longSignature = validSignature + 'extra';

      expect(() => {
        verifyRazorpaySignature(webhookBody, longSignature, webhookSecret);
      }).toThrow(SignatureVerificationError);
    });

    it('should include length details in error context', () => {
      const shortSignature = 'abc123def456';

      try {
        verifyRazorpaySignature(webhookBody, shortSignature, webhookSecret);
        fail('Should have thrown SignatureVerificationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SignatureVerificationError);
        expect(error.context.reason).toBe('length_mismatch');
        expect(error.context.providedLength).toBeDefined();
        expect(error.context.expectedLength).toBeDefined();
      }
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use timingSafeEqual for comparison', () => {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(webhookBody)
        .digest('hex');

      // This test verifies that the function completes without error
      // The actual timing-safe comparison is handled by crypto.timingSafeEqual
      const result = verifyRazorpaySignature(webhookBody, signature, webhookSecret);
      expect(result).toBe(true);
    });

    it('should throw error immediately for different length signatures', () => {
      // Different length signatures should fail before timingSafeEqual
      const shortSignature = 'abc123';
      
      const startTime = Date.now();
      
      try {
        verifyRazorpaySignature(webhookBody, shortSignature, webhookSecret);
        fail('Should have thrown error');
      } catch (error) {
        const duration = Date.now() - startTime;
        // Should fail quickly (less than 100ms)
        expect(duration).toBeLessThan(100);
        expect(error.context.reason).toBe('length_mismatch');
      }
    });
  });

  describe('Error Context Logging', () => {
    it('should include duration in error context', () => {
      const invalidSignature = 'abc123def456ghi789';

      try {
        verifyRazorpaySignature(webhookBody, invalidSignature, webhookSecret);
        fail('Should have thrown error');
      } catch (error) {
        expect(error.context.duration).toBeDefined();
        expect(error.context.duration).toMatch(/\d+ms/);
      }
    });

    it('should include body and signature metadata in context', () => {
      const signature = 'invalidhex';

      try {
        verifyRazorpaySignature(webhookBody, signature, webhookSecret);
        fail('Should have thrown error');
      } catch (error) {
        expect(error.context.hasBody).toBe(true);
        expect(error.context.bodyLength).toBe(webhookBody.length);
        expect(error.context.hasSignature).toBe(true);
        expect(error.context.signatureLength).toBe(signature.length);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty JSON object body', () => {
      const emptyBody = '{}';
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(emptyBody)
        .digest('hex');

      const result = verifyRazorpaySignature(emptyBody, signature, webhookSecret);
      expect(result).toBe(true);
    });

    it('should handle body with newlines', () => {
      const bodyWithNewlines = '{\n  "event": "test"\n}';
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(bodyWithNewlines)
        .digest('hex');

      const result = verifyRazorpaySignature(bodyWithNewlines, signature, webhookSecret);
      expect(result).toBe(true);
    });

    it('should handle body with tabs', () => {
      const bodyWithTabs = '{\t"event":\t"test"\t}';
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(bodyWithTabs)
        .digest('hex');

      const result = verifyRazorpaySignature(bodyWithTabs, signature, webhookSecret);
      expect(result).toBe(true);
    });
  });
});

