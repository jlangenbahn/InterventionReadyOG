/**
 * Amplify Gen 2 backend entry: auth, data, and Bedrock-backed Lambdas.
 */
import { defineBackend } from '@aws-amplify/backend';
import { Duration } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { generateLessonTextFn } from './functions/generate-lesson-text/resource';
import { selectFocusWordsFn } from './functions/select-focus-words/resource';
import { commitLessonScopeFn } from './functions/commit-lesson-scope/resource';
import { runDataQualityAuditFn } from './functions/run-data-quality-audit/resource';
import { runSpellCheckFn } from './functions/run-spell-check/resource';
import { generateConceptDescriptionsFn } from './functions/generate-concept-descriptions/resource';
import { generateDictionaryDefinitionsFn } from './functions/generate-dictionary-definitions/resource';
import { addCatalogWordsFn } from './functions/add-catalog-words/resource';
import { startDictionaryMegaBatchFn } from './functions/start-dictionary-mega-batch/resource';
import { dictionaryWorkerFn } from './functions/dictionary-worker/resource';

const backend = defineBackend({
  auth,
  data,
  generateLessonTextFn,
  selectFocusWordsFn,
  commitLessonScopeFn,
  runDataQualityAuditFn,
  runSpellCheckFn,
  generateConceptDescriptionsFn,
  generateDictionaryDefinitionsFn,
  addCatalogWordsFn,
  startDictionaryMegaBatchFn,
  dictionaryWorkerFn,
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

// Data-quality Lambdas use Claude Haiku 4.5 via the US cross-region inference profile.
// CRIS requires both the inference-profile ARN and the foundation-model ARN.
function grantHaikuUsInvoke(lambda: { addToRolePolicy: (statement: PolicyStatement) => void }) {
  lambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:*:${account}:inference-profile/us.${HAIKU_45_MODEL}`,
        `arn:aws:bedrock:*::foundation-model/${HAIKU_45_MODEL}`,
      ],
    }),
  );
}

grantHaikuUsInvoke(backend.runDataQualityAuditFn.resources.lambda);
grantHaikuUsInvoke(backend.runSpellCheckFn.resources.lambda);
grantHaikuUsInvoke(backend.generateConceptDescriptionsFn.resources.lambda);
grantHaikuUsInvoke(backend.generateDictionaryDefinitionsFn.resources.lambda);
grantHaikuUsInvoke(backend.addCatalogWordsFn.resources.lambda);

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

wordTable.grantReadData(backend.runSpellCheckFn.resources.lambda);
findingTable.grantReadWriteData(backend.runSpellCheckFn.resources.lambda);
backend.runSpellCheckFn.addEnvironment('WORD_TABLE_NAME', wordTable.tableName);
backend.runSpellCheckFn.addEnvironment('FINDING_TABLE_NAME', findingTable.tableName);

conceptTable.grantReadWriteData(backend.generateConceptDescriptionsFn.resources.lambda);
backend.generateConceptDescriptionsFn.addEnvironment('CONCEPT_TABLE_NAME', conceptTable.tableName);

wordTable.grantReadWriteData(backend.generateDictionaryDefinitionsFn.resources.lambda);
backend.generateDictionaryDefinitionsFn.addEnvironment('WORD_TABLE_NAME', wordTable.tableName);

wordTable.grantReadWriteData(backend.addCatalogWordsFn.resources.lambda);
conceptTable.grantReadData(backend.addCatalogWordsFn.resources.lambda);
backend.addCatalogWordsFn.addEnvironment('WORD_TABLE_NAME', wordTable.tableName);
backend.addCatalogWordsFn.addEnvironment('CONCEPT_TABLE_NAME', conceptTable.tableName);

const batchJobTable = backend.data.resources.tables['BatchJob'];
const dictionaryMegaBatchDlq = new Queue(backend.data.stack, 'DictionaryMegaBatchDlq', {
  retentionPeriod: Duration.days(14),
});
const dictionaryMegaBatchQueue = new Queue(backend.data.stack, 'DictionaryMegaBatchQueue', {
  visibilityTimeout: Duration.seconds(90),
  deadLetterQueue: {
    queue: dictionaryMegaBatchDlq,
    maxReceiveCount: 3,
  },
});

wordTable.grantReadData(backend.startDictionaryMegaBatchFn.resources.lambda);
batchJobTable.grantReadWriteData(backend.startDictionaryMegaBatchFn.resources.lambda);
dictionaryMegaBatchQueue.grantSendMessages(backend.startDictionaryMegaBatchFn.resources.lambda);
backend.startDictionaryMegaBatchFn.addEnvironment('WORD_TABLE_NAME', wordTable.tableName);
backend.startDictionaryMegaBatchFn.addEnvironment('BATCH_JOB_TABLE_NAME', batchJobTable.tableName);
backend.startDictionaryMegaBatchFn.addEnvironment('DICTIONARY_QUEUE_URL', dictionaryMegaBatchQueue.queueUrl);

grantHaikuUsInvoke(backend.dictionaryWorkerFn.resources.lambda);
wordTable.grantReadWriteData(backend.dictionaryWorkerFn.resources.lambda);
batchJobTable.grantReadWriteData(backend.dictionaryWorkerFn.resources.lambda);
dictionaryMegaBatchQueue.grantConsumeMessages(backend.dictionaryWorkerFn.resources.lambda);
backend.dictionaryWorkerFn.addEnvironment('WORD_TABLE_NAME', wordTable.tableName);
backend.dictionaryWorkerFn.addEnvironment('BATCH_JOB_TABLE_NAME', batchJobTable.tableName);
backend.dictionaryWorkerFn.resources.lambda.addEventSource(
  new SqsEventSource(dictionaryMegaBatchQueue, {
    batchSize: 1,
    maxConcurrency: 5,
    reportBatchItemFailures: true,
  }),
);
