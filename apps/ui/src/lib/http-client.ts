import createFetchClient from 'openapi-fetch';
import createClient from 'openapi-react-query';
import type { paths } from 'stalemate-openapi';

// The API sits under /api on the UI's own host: the Vite proxy in dev, the route in production.
const fetchClient = createFetchClient<paths>({ baseUrl: '/api' });

export const $api = createClient(fetchClient);
