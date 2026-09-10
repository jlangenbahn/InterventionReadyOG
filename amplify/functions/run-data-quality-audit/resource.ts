/**
 * Lambda resource for the catalog data-quality audit (Bedrock later).
 */
import { defineFunction } from '@aws-amplify/backend';

export const runDataQualityAuditFn = defineFunction({
  name: 'run-data-quality-audit',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 256,
  resourceGroupName: 'data',
});
