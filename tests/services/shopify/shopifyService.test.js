const shopifyService = require('../../../src/services/shopify/shopifyService');
const logger = require('../../../src/utils/logger');

jest.mock('../../../src/utils/logger');

describe('Shopify Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createShopifyOrder', () => {
    it('should create an order', async () => {
      const orderDetails = { item: 'Test Item', quantity: 1 };
      const order = await shopifyService.createShopifyOrder(orderDetails);
      expect(order).toHaveProperty('id');
      expect(order.item).toBe('Test Item');
      expect(logger.info).toHaveBeenCalledWith('Creating Shopify order', { orderDetails });
    });
  });

  describe('getShopifyOrder', () => {
    it('should get an order by id', async () => {
      const order = await shopifyService.getShopifyOrder('sh_ord_123');
      expect(order).toEqual({ id: 'sh_ord_123', status: 'created', line_items: [] });
      expect(logger.info).toHaveBeenCalledWith('Getting Shopify order', { orderId: 'sh_ord_123' });
    });
  });
});
