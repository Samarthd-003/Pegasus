const orderService = require('../../../src/services/order/orderService');
const shopifyService = require('../../../src/services/shopify/shopifyService');

jest.mock('../../../src/services/shopify/shopifyService');

describe('Order Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orderService.ordersDB.clear();
  });

  it('should create an order via Shopify and store it', async () => {
    const orderDetails = { item: 'Test Item', quantity: 1 };
    const mockShopifyOrder = { id: 'sh_ord_123', ...orderDetails };
    shopifyService.createShopifyOrder.mockResolvedValue(mockShopifyOrder);

    const order = await orderService.createOrder(orderDetails);

    expect(shopifyService.createShopifyOrder).toHaveBeenCalledWith(orderDetails);
    expect(order).toEqual(mockShopifyOrder);
  });

  it('should get an order by id from the cache', async () => {
    const orderDetails = { item: 'Test Item', quantity: 1 };
    const mockShopifyOrder = { id: 'sh_ord_123', ...orderDetails };
    await orderService.createOrder(orderDetails);
    shopifyService.createShopifyOrder.mockResolvedValue(mockShopifyOrder);

    const order = await orderService.getOrderById('sh_ord_123');

    expect(shopifyService.getShopifyOrder).not.toHaveBeenCalled();
    expect(order).toEqual(mockShopifyOrder);
  });

  it('should get an order by id from Shopify if not in cache', async () => {
    const mockShopifyOrder = { id: 'sh_ord_123', item: 'Test Item' };
    shopifyService.getShopifyOrder.mockResolvedValue(mockShopifyOrder);

    const order = await orderService.getOrderById('sh_ord_123');

    expect(shopifyService.getShopifyOrder).toHaveBeenCalledWith('sh_ord_123');
    expect(order).toEqual(mockShopifyOrder);
  });

  it('should update an order status to paid', async () => {
    const orderDetails = { item: 'Test Item', quantity: 1 };
    const mockShopifyOrder = { id: 'sh_ord_123', ...orderDetails, status: 'created' };
    shopifyService.createShopifyOrder.mockResolvedValue(mockShopifyOrder);
    await orderService.createOrder(orderDetails);

    const updatedOrder = await orderService.updateOrderStatus('sh_ord_123', 'paid');

    expect(updatedOrder.status).toBe('paid');
    expect(updatedOrder.failureReason).toBeUndefined();
  });

  it('should update an order status to failed with a reason', async () => {
    const orderDetails = { item: 'Test Item', quantity: 1 };
    const mockShopifyOrder = { id: 'sh_ord_123', ...orderDetails, status: 'created' };
    shopifyService.createShopifyOrder.mockResolvedValue(mockShopifyOrder);
    await orderService.createOrder(orderDetails);

    const updatedOrder = await orderService.updateOrderStatus('sh_ord_123', 'failed', 'Payment declined');

    expect(updatedOrder.status).toBe('failed');
    expect(updatedOrder.failureReason).toBe('Payment declined');
  });
});
