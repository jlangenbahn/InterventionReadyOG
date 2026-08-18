import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { generateLessonTextFn } from './functions/generate-lesson-text/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  generateLessonTextFn,
});

const HAIKU_45_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0';
const account = backend.data.stack.account;

backend.generateLessonTextFn.resources.lambda.addToRolePolicy(
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
