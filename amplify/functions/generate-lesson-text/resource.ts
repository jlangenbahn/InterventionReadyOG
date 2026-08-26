/**
 * Lambda resource for Ask Andrea sentence/passage generation.
 */
import { defineFunction } from '@aws-amplify/backend';

export const generateLessonTextFn = defineFunction({
  name: 'generate-lesson-text',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'data',
});
