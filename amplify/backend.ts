/**
 * Amplify Gen 2 backend entry: auth, data, and Bedrock-backed Lambdas.
 */
import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { generateLessonTextFn } from './functions/generate-lesson-text/resource';
import { selectFocusWordsFn } from './functions/select-focus-words/resource';

const backend = defineBackend({
  auth,
  data,
  generateLessonTextFn,
  selectFocusWordsFn,
});

const HAIKU_45_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0';
const account = backend.data.stack.account;

// Ask Andrea Lambdas call Claude Haiku via Bedrock Converse (cross-region + global profiles).
function grantHaikuConverse(lambda: { addToRolePolicy: (statement: PolicyStatement) => void }) {
  lambda.addToRolePolicy(
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

grantHaikuConverse(backend.generateLessonTextFn.resources.lambda);
grantHaikuConverse(backend.selectFocusWordsFn.resources.lambda);
