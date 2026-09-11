/**
 * Bedrock Converse dictionary writer. Processes one word-id batch (max 10),
 * generates a structured DictionaryData entry, then writes Word.dictionaryData.
 */
import {
  runDictionaryGeneration,
  uniqueIds,
  type DictionaryGenerationResult,
} from '../_shared/dictionaryDefinitions';

type GenerateEvent = {
  arguments?: {
    wordIds?: Array<string | null> | null;
  };
};

export const handler = async (event: GenerateEvent): Promise<DictionaryGenerationResult> => {
  return runDictionaryGeneration(uniqueIds(event.arguments?.wordIds));
};
