/**
 * Lambda resource for the catalog data-quality audit (Bedrock Converse).
 */
import { defineFunction } from '@aws-amplify/backend';

export const runDataQualityAuditFn = defineFunction({
  name: 'run-data-quality-audit',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'data',
});
