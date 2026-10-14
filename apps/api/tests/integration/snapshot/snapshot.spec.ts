import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'jest-openapi';
import 'jest-extended';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { StatusCodes } from 'http-status-codes';
import type { ExpectResponseStatus, RequestSender } from '@map-colonies/openapi-helpers/requestSender';
import { createRequestSender, expectResponseStatusFactory } from '@map-colonies/openapi-helpers/requestSender';
import type { operations, paths } from 'stalemate-openapi';
import { getApp } from '@src/app';
import { SERVICES } from '@common/constants';
import { initConfig } from '@common/config';
import { OPENAPI_PATH } from '@tests/utils/paths.mjs';

const expectResponseStatus: ExpectResponseStatus = expectResponseStatusFactory(expect);

describe('snapshot', function () {
  let requestSender: RequestSender<paths, operations>;

  beforeAll(async function () {
    await initConfig(true);
  });

  beforeEach(async function () {
    const [app] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: await jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });
    requestSender = await createRequestSender<paths, operations>(OPENAPI_PATH, app);
  });

  describe('GET /snapshot', function () {
    it('should return 503 warming before the first sweep', async function () {
      const response = await requestSender.getSnapshot();

      expectResponseStatus(response, StatusCodes.SERVICE_UNAVAILABLE);

      expect(response).toSatisfyApiSpec();
      expect(response.body.status).toBe('warming');
    });
  });

  describe('POST /refresh', function () {
    it('should return 202 with the sync state', async function () {
      const response = await requestSender.refresh();

      expectResponseStatus(response, StatusCodes.ACCEPTED);

      expect(response).toSatisfyApiSpec();
      expect(response.body.state).toBeOneOf(['idle', 'syncing']);
    });
  });
});
