import { createAuthendClient } from '@authend/sdk';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:7002';

export const client = createAuthendClient({ baseURL });
