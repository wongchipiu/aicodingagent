// Content for the smartagent-api bundled skill.
// Each .md file is inlined as a string at build time via Bun's text loader.

import csharpSmartAgentApi from './smartagent-api/csharp/smartagent-api.md'
import curlExamples from './smartagent-api/curl/examples.md'
import goSmartAgentApi from './smartagent-api/go/smartagent-api.md'
import javaSmartAgentApi from './smartagent-api/java/smartagent-api.md'
import phpSmartAgentApi from './smartagent-api/php/smartagent-api.md'
import pythonAgentSdkPatterns from './smartagent-api/python/agent-sdk/patterns.md'
import pythonAgentSdkReadme from './smartagent-api/python/agent-sdk/README.md'
import pythonSmartAgentApiBatches from './smartagent-api/python/smartagent-api/batches.md'
import pythonSmartAgentApiFilesApi from './smartagent-api/python/smartagent-api/files-api.md'
import pythonSmartAgentApiReadme from './smartagent-api/python/smartagent-api/README.md'
import pythonSmartAgentApiStreaming from './smartagent-api/python/smartagent-api/streaming.md'
import pythonSmartAgentApiToolUse from './smartagent-api/python/smartagent-api/tool-use.md'
import rubySmartAgentApi from './smartagent-api/ruby/smartagent-api.md'
import skillPrompt from './smartagent-api/SKILL.md'
import sharedErrorCodes from './smartagent-api/shared/error-codes.md'
import sharedLiveSources from './smartagent-api/shared/live-sources.md'
import sharedModels from './smartagent-api/shared/models.md'
import sharedPromptCaching from './smartagent-api/shared/prompt-caching.md'
import sharedToolUseConcepts from './smartagent-api/shared/tool-use-concepts.md'
import typescriptAgentSdkPatterns from './smartagent-api/typescript/agent-sdk/patterns.md'
import typescriptAgentSdkReadme from './smartagent-api/typescript/agent-sdk/README.md'
import typescriptSmartAgentApiBatches from './smartagent-api/typescript/smartagent-api/batches.md'
import typescriptSmartAgentApiFilesApi from './smartagent-api/typescript/smartagent-api/files-api.md'
import typescriptSmartAgentApiReadme from './smartagent-api/typescript/smartagent-api/README.md'
import typescriptSmartAgentApiStreaming from './smartagent-api/typescript/smartagent-api/streaming.md'
import typescriptSmartAgentApiToolUse from './smartagent-api/typescript/smartagent-api/tool-use.md'

// @[MODEL LAUNCH]: Update the model IDs/names below. These are substituted into {{VAR}}
// placeholders in the .md files at runtime before the skill prompt is sent.
// After updating these constants, manually update the two files that still hardcode models:
//   - smartagent-api/SKILL.md (Current Models pricing table)
//   - smartagent-api/shared/models.md (full model catalog with legacy versions and alias mappings)
export const SKILL_MODEL_VARS = {
  OPUS_ID: 'smartagent-opus-4-6',
  OPUS_NAME: 'SmartAgent Opus 4.6',
  SONNET_ID: 'smartagent-sonnet-4-6',
  SONNET_NAME: 'SmartAgent Sonnet 4.6',
  HAIKU_ID: 'smartagent-haiku-4-5',
  HAIKU_NAME: 'SmartAgent Haiku 4.5',
  // Previous Sonnet ID — used in "do not append date suffixes" example in SKILL.md.
  PREV_SONNET_ID: 'smartagent-sonnet-4-5',
} satisfies Record<string, string>

export const SKILL_PROMPT: string = skillPrompt

export const SKILL_FILES: Record<string, string> = {
  'csharp/smartagent-api.md': csharpSmartAgentApi,
  'curl/examples.md': curlExamples,
  'go/smartagent-api.md': goSmartAgentApi,
  'java/smartagent-api.md': javaSmartAgentApi,
  'php/smartagent-api.md': phpSmartAgentApi,
  'python/agent-sdk/README.md': pythonAgentSdkReadme,
  'python/agent-sdk/patterns.md': pythonAgentSdkPatterns,
  'python/smartagent-api/README.md': pythonSmartAgentApiReadme,
  'python/smartagent-api/batches.md': pythonSmartAgentApiBatches,
  'python/smartagent-api/files-api.md': pythonSmartAgentApiFilesApi,
  'python/smartagent-api/streaming.md': pythonSmartAgentApiStreaming,
  'python/smartagent-api/tool-use.md': pythonSmartAgentApiToolUse,
  'ruby/smartagent-api.md': rubySmartAgentApi,
  'shared/error-codes.md': sharedErrorCodes,
  'shared/live-sources.md': sharedLiveSources,
  'shared/models.md': sharedModels,
  'shared/prompt-caching.md': sharedPromptCaching,
  'shared/tool-use-concepts.md': sharedToolUseConcepts,
  'typescript/agent-sdk/README.md': typescriptAgentSdkReadme,
  'typescript/agent-sdk/patterns.md': typescriptAgentSdkPatterns,
  'typescript/smartagent-api/README.md': typescriptSmartAgentApiReadme,
  'typescript/smartagent-api/batches.md': typescriptSmartAgentApiBatches,
  'typescript/smartagent-api/files-api.md': typescriptSmartAgentApiFilesApi,
  'typescript/smartagent-api/streaming.md': typescriptSmartAgentApiStreaming,
  'typescript/smartagent-api/tool-use.md': typescriptSmartAgentApiToolUse,
}
