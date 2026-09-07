/**
 * Lambda resource: atomically commit Scope & Sequence with a saved lesson.
 */
import { defineFunction } from '@aws-amplify/backend';

export const commitLessonScopeFn = defineFunction({
  name: 'commit-lesson-scope',
  entry: './handler.ts',
  timeoutSeconds: 15,
  memoryMB: 256,
  resourceGroupName: 'data',
});
