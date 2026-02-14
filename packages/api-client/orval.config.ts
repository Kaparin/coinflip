import { defineConfig } from 'orval';

export default defineConfig({
  coinflip: {
    input: {
      target: '../../tooling/openapi/openapi.json',
    },
    output: {
      target: './src/generated/index.ts',
      client: 'react-query',
      mode: 'single',
      override: {
        mutator: {
          path: './src/custom-fetch.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
          useSuspenseQuery: true,
        },
      },
    },
  },
});
