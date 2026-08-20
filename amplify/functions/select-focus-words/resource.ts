import { defineFunction } from '@aws-amplify/backend';

export const selectFocusWordsFn = defineFunction({
  name: 'select-focus-words',
  entry: './handler.ts',
  timeoutSeconds: 45,
  memoryMB: 512,
  resourceGroupName: 'data',
});
