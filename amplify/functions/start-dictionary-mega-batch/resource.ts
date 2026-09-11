/**
 * AppSync dispatcher: enqueue catalog words that still need dictionary data.
 */
import { defineFunction } from '@aws-amplify/backend';

export const startDictionaryMegaBatchFn = defineFunction({
  name: 'start-dictionary-mega-batch',
  entry: './handler.ts',
  timeoutSeconds: 29,
  memoryMB: 1024,
  resourceGroupName: 'data',
});
