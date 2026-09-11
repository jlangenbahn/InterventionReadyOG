/**
 * Lambda resource for adding net-new catalog words (Bedrock Converse).
 */
import { defineFunction } from '@aws-amplify/backend';

export const addCatalogWordsFn = defineFunction({
  name: 'add-catalog-words',
  entry: './handler.ts',
  timeoutSeconds: 29,
  memoryMB: 512,
  resourceGroupName: 'data',
});
