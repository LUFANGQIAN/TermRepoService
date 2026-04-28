import { ApiHealthController } from './api-health.controller';

describe('ApiHealthController', () => {
  it('returns an api envelope with health status', () => {
    const controller = new ApiHealthController();
    const response = controller.check();

    expect(response.code).toBe(0);
    expect(response.data.status).toBe('up');
    expect(typeof response.data.time).toBe('string');
  });
});

