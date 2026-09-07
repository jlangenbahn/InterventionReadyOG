/**
 * TransactWriteItems: ConditionCheck the saved Lesson, then update Student.scopeAndSequence.
 * Keeps lesson history and scope status in the same DynamoDB transaction.
 */
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});

function envVar(name: string) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return String(env?.[name] ?? '').trim();
}

type CommitEvent = {
  arguments?: {
    studentId?: string | null;
    lessonId?: string | null;
    scopeAndSequence?: string | null;
  };
  identity?: {
    sub?: string | null;
    username?: string | null;
    claims?: { sub?: string | null };
  } | null;
};

function ownerValues(identity: CommitEvent['identity']) {
  const sub = String(identity?.sub || identity?.claims?.sub || '').trim();
  if (!sub) return null;
  return {
    owner: sub,
    ownerPrefix: `${sub}::`,
  };
}

export const handler = async (event: CommitEvent): Promise<string> => {
  const studentId = String(event.arguments?.studentId || '').trim();
  const lessonId = String(event.arguments?.lessonId || '').trim();
  const scopeAndSequence = String(event.arguments?.scopeAndSequence || '').trim();
  const studentTable = envVar('STUDENT_TABLE_NAME');
  const lessonTable = envVar('LESSON_TABLE_NAME');
  const owner = ownerValues(event.identity);

  if (!studentId || !lessonId || !scopeAndSequence) {
    throw new Error('Student, lesson, and scope payload are required.');
  }
  if (!studentTable || !lessonTable) {
    throw new Error('Scope sync is not configured in this environment.');
  }
  if (!owner) {
    throw new Error('You must be signed in to update Scope and Sequence.');
  }

  JSON.parse(scopeAndSequence);

  const now = new Date().toISOString();
  await dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: lessonTable,
            Key: { id: { S: lessonId } },
            ConditionExpression:
              'attribute_exists(id) AND studentID = :studentId AND (owner = :owner OR begins_with(owner, :ownerPrefix))',
            ExpressionAttributeValues: {
              ':studentId': { S: studentId },
              ':owner': { S: owner.owner },
              ':ownerPrefix': { S: owner.ownerPrefix },
            },
          },
        },
        {
          Update: {
            TableName: studentTable,
            Key: { id: { S: studentId } },
            UpdateExpression: 'SET scopeAndSequence = :scope, #updatedAt = :now',
            ConditionExpression:
              'attribute_exists(id) AND (owner = :owner OR begins_with(owner, :ownerPrefix))',
            ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
            ExpressionAttributeValues: {
              ':scope': { S: scopeAndSequence },
              ':now': { S: now },
              ':owner': { S: owner.owner },
              ':ownerPrefix': { S: owner.ownerPrefix },
            },
          },
        },
      ],
    }),
  );

  return scopeAndSequence;
};
