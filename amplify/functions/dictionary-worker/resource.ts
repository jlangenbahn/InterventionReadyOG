/**
 * SQS worker: generate dictionary entries for one word-id batch via Bedrock.
 */
import { defineFunction } from '@aws-amplify/backend';

export const dictionaryWorkerFn = defineFunction({
  name: 'dictionary-worker',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  resourceGroupName: 'data',
});
