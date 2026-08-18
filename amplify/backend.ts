import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
});

/**
 * Amplify generation routes grant bedrock:InvokeModel on the foundation-model ARN only.
 * Claude Haiku 4.5 is invoked through a cross-region inference profile, so the AppSync
 * data-source role also needs the inference-profile ARN. See:
 * https://github.com/aws-amplify/amplify-category-api/issues/3502
 */
const HAIKU_45_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0';
const account = backend.data.stack.account;

const granted = new Set<string>();
function grantGenerationBedrock(construct: { node: { path: string } }) {
  if (!(construct instanceof Role)) return;
  if (!construct.node.path.includes('GenerationBedrock')) return;
  if (granted.has(construct.node.path)) return;
  granted.add(construct.node.path);
  construct.addToPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:aws:bedrock:*:${account}:inference-profile/us.${HAIKU_45_MODEL}`,
        `arn:aws:bedrock:*:${account}:inference-profile/global.${HAIKU_45_MODEL}`,
        `arn:aws:bedrock:*::foundation-model/${HAIKU_45_MODEL}`,
      ],
    }),
  );
}

backend.data.node.findAll().forEach(grantGenerationBedrock);
backend.data.stack.node.findAll().forEach(grantGenerationBedrock);
