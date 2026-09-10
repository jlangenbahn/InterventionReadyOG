/**
 * Amplify Gen 2 backend entry: auth, data, and Bedrock-backed Lambdas.
 */
import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { generateLessonTextFn } from './functions/generate-lesson-text/resource';
import { selectFocusWordsFn } from './functions/select-focus-words/resource';
import { commitLessonScopeFn } from './functions/commit-lesson-scope/resource';
import { runDataQualityAuditFn } from './functions/run-data-quality-audit/resource';

const backend = defineBackend({
  auth,
  data,
  generateLessonTextFn,
  selectFocusWordsFn,
  commitLessonScopeFn,
  runDataQualityAuditFn,
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

// Data-quality audit uses Claude Haiku 4.5 via the US cross-region inference profile.
// CRIS requires both the inference-profile ARN and the foundation-model ARN.
backend.runDataQualityAuditFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      `arn:aws:bedrock:*:${account}:inference-profile/us.${HAIKU_45_MODEL}`,
      `arn:aws:bedrock:*::foundation-model/${HAIKU_45_MODEL}`,
    ],
  }),
);

const studentTable = backend.data.resources.tables['Student'];
const lessonTable = backend.data.resources.tables['Lesson'];
studentTable.grantReadWriteData(backend.commitLessonScopeFn.resources.lambda);
lessonTable.grantReadWriteData(backend.commitLessonScopeFn.resources.lambda);
backend.commitLessonScopeFn.addEnvironment(
  'STUDENT_TABLE_NAME',
  studentTable.tableName,
);
backend.commitLessonScopeFn.addEnvironment(
  'LESSON_TABLE_NAME',
  lessonTable.tableName,
);

const wordTable = backend.data.resources.tables['Word'];
const conceptTable = backend.data.resources.tables['Concept'];
const conceptWordTable = backend.data.resources.tables['ConceptWord'];
const findingTable = backend.data.resources.tables['DataQualityFinding'];
wordTable.grantReadData(backend.runDataQualityAuditFn.resources.lambda);
conceptTable.grantReadData(backend.runDataQualityAuditFn.resources.lambda);
conceptWordTable.grantReadData(backend.runDataQualityAuditFn.resources.lambda);
findingTable.grantReadWriteData(backend.runDataQualityAuditFn.resources.lambda);
backend.runDataQualityAuditFn.addEnvironment('WORD_TABLE_NAME', wordTable.tableName);
backend.runDataQualityAuditFn.addEnvironment('CONCEPT_TABLE_NAME', conceptTable.tableName);
backend.runDataQualityAuditFn.addEnvironment('CONCEPT_WORD_TABLE_NAME', conceptWordTable.tableName);
backend.runDataQualityAuditFn.addEnvironment('FINDING_TABLE_NAME', findingTable.tableName);
