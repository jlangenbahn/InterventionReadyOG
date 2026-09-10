/**
 * Lambda resource for generating Word.dictionaryData entries.
 */
import { defineFunction } from '@aws-amplify/backend';

export const generateDictionaryDefinitionsFn = defineFunction({
  name: 'generate-dictionary-definitions',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'data',
});
