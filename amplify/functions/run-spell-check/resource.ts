/**
 * Lambda resource for catalog spell check (Bedrock Converse).
 */
import { defineFunction } from '@aws-amplify/backend';

export const runSpellCheckFn = defineFunction({
  name: 'run-spell-check',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'data',
});
