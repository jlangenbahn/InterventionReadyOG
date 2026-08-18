import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { generateLessonTextFn } from '../functions/generate-lesson-text/resource';

/**
 * Ported from ready-og Gen1 schema.graphql (app 6cvcpcvgbjdq3evrmqh4zyw4oi).
 * Gen1 @manyToMany relationships are explicit join models in Gen 2.
 */
const schema = a.schema({
  GenerateDocument: a
    .model({
      listObject: a.json(),
      docParameters: a.json(),
      downloadDocumentLink: a.url(),
    })
    .authorization((allow) => [allow.owner()]),

  Student: a
    .model({
      lastName: a.string(),
      firstName: a.string(),
      dob: a.date(),
      comments: a.string(),
      customID: a.string(),
      studentData: a.json(),
      /**
       * Per-student concept inventory ("Scope and Sequence").
       * Array of {
       *   conceptId,
       *   inScope: boolean,
       *   masteryStatus: 'unknown'|'new'|'review'|'mastered',
       *   sequence: number|null (user ordering, max 999)
       * }
       */
      scopeAndSequence: a.json(),
      Lessons: a.hasMany('Lesson', 'studentID'),
      Lists: a.hasMany('List', 'studentID'),
      Sentences: a.hasMany('Sentence', 'studentID'),
      Passages: a.hasMany('Passage', 'studentID'),
      Concepts: a.hasMany('StudentConcept', 'studentId'),
      Groups: a.hasMany('GroupStudent', 'studentId'),
    })
    .authorization((allow) => [allow.owner()]),

  Group: a
    .model({
      name: a.string().required(),
      groupData: a.json(),
      students: a.hasMany('GroupStudent', 'groupId'),
    })
    .authorization((allow) => [allow.owner()]),

  GroupStudent: a
    .model({
      groupId: a.id().required(),
      studentId: a.id().required(),
      group: a.belongsTo('Group', 'groupId'),
      student: a.belongsTo('Student', 'studentId'),
    })
    .secondaryIndexes((index) => [index('groupId'), index('studentId')])
    .authorization((allow) => [allow.owner()]),

  Passage: a
    .model({
      title: a.string(),
      text: a.string(),
      wordCount: a.integer(),
      author: a.string(),
      downvotes: a.integer(),
      upvotes: a.integer(),
      gptPrompt: a.string(),
      /**
       * Singular unifying focus concept for this passage.
       * Other tagged concepts live in passageData.tags.
       */
      conceptID: a.id().required(),
      concept: a.belongsTo('Concept', 'conceptID'),
      // Optional so catalog passages remain shared; set when assigning to a student.
      studentID: a.id(),
      student: a.belongsTo('Student', 'studentID'),
      Lessons: a.hasMany('PassageLesson', 'passageId'),
      passageData: a.json(),
    })
    .secondaryIndexes((index) => [index('conceptID'), index('studentID')])
    .authorization((allow) => [allow.authenticated()]),

  Sentence: a
    .model({
      text: a.string(),
      wordCount: a.integer(),
      author: a.string(),
      upvotes: a.integer(),
      downvotes: a.integer(),
      gptPrompt: a.string(),
      // Optional so catalog sentences remain shared; set when assigning to a student.
      studentID: a.id(),
      student: a.belongsTo('Student', 'studentID'),
      Lessons: a.hasMany('SentenceLesson', 'sentenceId'),
      Words: a.hasMany('SentenceWord', 'sentenceId'),
      Concepts: a.hasMany('SentenceConcept', 'sentenceId'),
      /**
       * Singular unifying focus concept for this sentence.
       * Other tagged concepts live on SentenceConcept.
       */
      conceptID: a.id(),
      focusConcept: a.belongsTo('Concept', 'conceptID'),
      sentenceData: a.json(),
    })
    .secondaryIndexes((index) => [index('studentID'), index('conceptID')])
    .authorization((allow) => [allow.authenticated()]),

  Lesson: a
    .model({
      date: a.date(),
      minutes: a.integer(),
      rating: a.integer(),
      studentID: a.id().required(),
      student: a.belongsTo('Student', 'studentID'),
      // Gen1 field name for Concept.hasMany(NewLessons) via byConcept
      concepts: a.id().required(),
      concept: a.belongsTo('Concept', 'concepts'),
      conceptLinks: a.hasMany('ConceptLesson', 'lessonId'),
      passages: a.hasMany('PassageLesson', 'lessonId'),
      sentences: a.hasMany('SentenceLesson', 'lessonId'),
      lists: a.hasMany('ListLesson', 'lessonId'),
      lessonNumber: a.integer(),
      name: a.string(),
      lessonData: a.json(),
      comments: a.string(),
    })
    .secondaryIndexes((index) => [
      index('studentID'),
      index('concepts'),
    ])
    .authorization((allow) => [allow.owner()]),

  Word: a
    .model({
      word: a.string(),
      isNonsenseWord: a.boolean(),
      concepts: a.hasMany('ConceptWord', 'wordId'),
      sentences: a.hasMany('SentenceWord', 'wordId'),
      Lists: a.hasMany('WordList', 'wordId'),
      wordData: a.json(),
    })
    .authorization((allow) => [allow.authenticated()]),

  Concept: a
    .model({
      concept: a.string(),
      subcategory: a.string(),
      category: a.string(),
      level: a.string(),
      definition: a.string(),
      trainingResources: a.json(),
      NewLessons: a.hasMany('Lesson', 'concepts'),
      Lists: a.hasMany('List', 'conceptID'),
      Passages: a.hasMany('Passage', 'conceptID'),
      students: a.hasMany('StudentConcept', 'conceptId'),
      Words: a.hasMany('ConceptWord', 'conceptId'),
      ReviewLessons: a.hasMany('ConceptLesson', 'conceptId'),
      sentences: a.hasMany('SentenceConcept', 'conceptId'),
      FocusSentences: a.hasMany('Sentence', 'conceptID'),
    })
    .authorization((allow) => [allow.authenticated()]),

  List: a
    .model({
      name: a.string(),
      conceptID: a.id().required(),
      concept: a.belongsTo('Concept', 'conceptID'),
      words: a.hasMany('WordList', 'listId'),
      Lessons: a.hasMany('ListLesson', 'listId'),
      listData: a.json(),
      studentID: a.id().required(),
      student: a.belongsTo('Student', 'studentID'),
    })
    .secondaryIndexes((index) => [
      index('conceptID'),
      index('studentID'),
    ])
    .authorization((allow) => [allow.owner()]),

  // --- Join models (Gen1 @manyToMany) ---

  StudentConcept: a
    .model({
      studentId: a.id().required(),
      conceptId: a.id().required(),
      student: a.belongsTo('Student', 'studentId'),
      concept: a.belongsTo('Concept', 'conceptId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  PassageLesson: a
    .model({
      passageId: a.id().required(),
      lessonId: a.id().required(),
      passage: a.belongsTo('Passage', 'passageId'),
      lesson: a.belongsTo('Lesson', 'lessonId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  SentenceLesson: a
    .model({
      sentenceId: a.id().required(),
      lessonId: a.id().required(),
      sentence: a.belongsTo('Sentence', 'sentenceId'),
      lesson: a.belongsTo('Lesson', 'lessonId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  SentenceWord: a
    .model({
      sentenceId: a.id().required(),
      wordId: a.id().required(),
      sentence: a.belongsTo('Sentence', 'sentenceId'),
      word: a.belongsTo('Word', 'wordId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  SentenceConcept: a
    .model({
      sentenceId: a.id().required(),
      conceptId: a.id().required(),
      sentence: a.belongsTo('Sentence', 'sentenceId'),
      concept: a.belongsTo('Concept', 'conceptId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  ConceptLesson: a
    .model({
      conceptId: a.id().required(),
      lessonId: a.id().required(),
      concept: a.belongsTo('Concept', 'conceptId'),
      lesson: a.belongsTo('Lesson', 'lessonId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  ConceptWord: a
    .model({
      conceptId: a.id().required(),
      wordId: a.id().required(),
      concept: a.belongsTo('Concept', 'conceptId'),
      word: a.belongsTo('Word', 'wordId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  WordList: a
    .model({
      wordId: a.id().required(),
      listId: a.id().required(),
      word: a.belongsTo('Word', 'wordId'),
      list: a.belongsTo('List', 'listId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  ListLesson: a
    .model({
      listId: a.id().required(),
      lessonId: a.id().required(),
      list: a.belongsTo('List', 'listId'),
      lesson: a.belongsTo('Lesson', 'lessonId'),
    })
    .authorization((allow) => [allow.authenticated()]),

  /**
   * Lambda-backed Bedrock Converse call. Amplify a.generation() mapping templates
   * still use foundation-model ARNs, which Bedrock rejects for Haiku 4.5 inference profiles.
   */
  generateLessonDraft: a
    .query()
    .arguments({
      kind: a.string().required(),
      conceptName: a.string().required(),
      words: a.string().required(),
    })
    .returns(a.string())
    .handler(a.handler.function(generateLessonTextFn))
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
