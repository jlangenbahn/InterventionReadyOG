/**
 * Lambda resource for generating Orton-Gillingham concept rule descriptions.
 */
import { defineFunction } from '@aws-amplify/backend';

export const generateConceptDescriptionsFn = defineFunction({
  name: 'generate-concept-descriptions',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'data',
});
