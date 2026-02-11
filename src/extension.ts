import * as vscode from 'vscode';
import { simpleGit, SimpleGit } from 'simple-git';
import * as https from 'https';
import * as http from 'http';
import * as url from 'url';

export function activate(context: vscode.ExtensionContext) {
  console.log('[EXTENSION] vscode-git-commit-message-generator activated');

  // Register command
  const disposable = vscode.commands.registerCommand('vscode-git-commit-message-generator.generateCommitMessage', async (sourceControl) => {
    try {
      // Get Git extension
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      if (!gitExtension) {
        vscode.window.showErrorMessage('Unable to get Git extension');
        return;
      }

      const api = gitExtension.getAPI(1);
      if (!api) {
        vscode.window.showErrorMessage('Unable to get Git API');
        return;
      }

      // Get the currently selected Git source
      const repository = sourceControl?.rootUri
        ? api.repositories.find((repo: { rootUri: { fsPath: string } }) => repo.rootUri.fsPath === sourceControl.rootUri.fsPath)
        : api.repositories[0];

      if (!repository) {
        vscode.window.showErrorMessage('Unable to get Git repository');
        return;
      }

      const rootPath = repository.rootUri.fsPath;
      const git: SimpleGit = simpleGit(rootPath);

      // Check whether there are staged files
      let status = await git.status();
      if (status.staged.length === 0) {
        const hasWorkingTreeChanges = status.files.length > 0;
        const action = hasWorkingTreeChanges
          ? await vscode.window.showWarningMessage(
              'No staged files found. Stage your changes before generating a commit message.',
              'Stage All and Retry'
            )
          : undefined;

        if (action === 'Stage All and Retry') {
          await git.add(['.']);
          status = await git.status();
        }

        if (status.staged.length === 0) {
          vscode.window.showWarningMessage('No staged files found. Please stage files first.');
          return;
        }
      }

      // Create status bar message
      const statusBarMessage = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
      // Get staged file changes
      const stagedFiles = status.staged;
      statusBarMessage.text = `Found ${stagedFiles.length} staged files`;
      context.subscriptions.push(statusBarMessage);
      statusBarMessage.show();

      // Get diff for each file
      let allDiffs = '';
      // Classify files - identify deleted files by intersecting status.deleted and status.staged
      const deletedFiles = stagedFiles.filter(file => status.deleted.includes(file));
      // Other files are staged files excluding deletedFiles
      const otherFiles = stagedFiles.filter(file => !deletedFiles.includes(file));
      
      // Process non-deleted files
      for (const file of otherFiles) {
        try {
          const diff = await git.diff(['--cached', file]);
          allDiffs += `\nFile: ${file}\n${diff}\n`;
        } catch (error) {
          console.error(`Failed to get diff for file ${file}:`, error);
        }
      }
      
      // Special handling for deleted files
      for (const file of deletedFiles) {
        try {
          // Try to get basic information for deleted file
          const fileName = file || '';
          // Try to get the file's latest commit message to understand its purpose
          let fileInfo = '';
          let fileContent = '';
          try {
            // Get the latest commit log for the file
            const log = await git.log({ file: fileName, maxCount: 1 });
            if (log.all.length > 0) {
              const lastCommit = log.all[0];
              fileInfo = `\nLast commit message for this file: ${lastCommit.message}\n`;
              
              // Try to get file content from the latest commit
              try {
                // Use git show to get historical file content
                const fileHistoryContent = await git.raw(['show', `${lastCommit.hash}:${fileName}`]);
                if (fileHistoryContent) {
                  // Limit file content length to avoid oversized payloads
                  const maxContentLength = 300; // Up to 300 characters
                  const lines = fileHistoryContent.split('\n');
                  const first15Lines = lines.slice(0, 15).join('\n'); // Up to 15 lines
                  
                  // Enforce both character and line limits
                  let truncatedContent = first15Lines;
                  if (truncatedContent.length > maxContentLength) {
                    truncatedContent = truncatedContent.substring(0, maxContentLength) + '\n... (content too long, truncated)';
                  } else if (lines.length > 15) {
                    truncatedContent += '\n... (showing only the first 15 lines)';
                  }
                  
                  fileContent = `\nDeleted content from this file:\n\`\`\`\n${truncatedContent}\n\`\`\`\n`;
                }
              } catch (showError) {
                console.log(`Failed to get historical content for file ${fileName}:`, showError);
              }
            }
          } catch (logError) {
            console.log(`Failed to get commit history for file ${fileName}:`, logError);
          }
          
          // Add context information for deleted files
          allDiffs += `\nDeleted file: ${file} ${fileInfo}${fileContent}\n`;
        } catch (error) {
          console.error(`Failed to get information for deleted file ${file}:`, error);
          // Add basic information even if retrieval fails
          allDiffs += `\nFile: ${file} (deleted, unable to retrieve more information)\n`;
        }
      }

      statusBarMessage.text = 'AI is generating commit message...';

      let commitMessage = '';
      try {
        // Generate commit message based on changes
        // Add suffix for deleted files
        const markedFiles = stagedFiles.map(file => 
          deletedFiles.includes(file) ? `${file} (deleted)` : file
        );
        commitMessage = await generateCommitMessage(markedFiles, allDiffs, repository.inputBox, statusBarMessage);
        statusBarMessage.dispose();
      } catch (error) {
        statusBarMessage.dispose();
        throw error;
      }

      // Set final commit message
      repository.inputBox.value = commitMessage;
      statusBarMessage.text = 'Commit message set';
    } catch (error) {
      console.error('Error generating commit message:', error);
      vscode.window.showErrorMessage(`Failed to generate commit message: ${error}`);
    }
  });

  context.subscriptions.push(disposable);
}

/**
 * Call LLM API to generate commit message
 */
async function callLLMAPI(stagedFiles: string[], diffContent: string, inputBox: any, statusBarMessage: vscode.StatusBarItem): Promise<string> {
  const modelServices = [
    {
      name: 'gemini',
      // @doc https://ai.google.dev/gemini-api/docs/text-generation
      hostname: 'generativelanguage.googleapis.com',
      protocol: 'gemini',
      apiSuffix: '/v1beta/models/gemini-2.5-flash:generateContent',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': ''
      },
      AuthKey: 'x-goog-api-key'
    },
    {
      name: 'ollama',
      // @doc https://github.com/ollama/ollama/blob/main/docs/api.md#chat
      protocol: 'ollama',
      hostname: 'localhost',
      apiSuffix: '/api/generate',
      headers: {
        'Content-Type': 'application/json'
      }
    },
    {
      name: 'openai',
      // @doc https://platform.openai.com/docs/api-reference/completions/create
      hostname: 'api.openai.com',
      protocol: 'openai',
      apiSuffix: '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '
      },
      AuthKey: 'Authorization'
    },
    {
      name: 'aliyun',
      // @doc https://bailian.console.aliyun.com/#/model-market/detail/qwen2.5-32b-instruct?tabKey=sdk
      hostname: 'dashscope.aliyuncs.com',
      protocol: 'openai',
      apiSuffix: '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '
      },
      AuthKey: 'Authorization'
    },
    {
      name: 'anthropic',
      // @doc https://docs.anthropic.com/en/api/getting-started
      hostname: 'api.anthropic.com',
      protocol: 'anthropic',
      apiSuffix: '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        "Authorization": "Bearer ",
        'anthropic-version': '2023-06-01'
      },
      AuthKey: 'x-api-key'
    },
    {
      name: 'tencent',
      //@doc https://cloud.tencent.com/document/product/1729/111007
      hostname: 'api.hunyuan.cloud.tencent.com',
      protocol: 'openai',
      apiSuffix: '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '
      },
      AuthKey: 'Authorization'
    },
    {
      name: 'deepseek',
      hostname: 'api.deepseek.com',
      apiSuffix: '/chat/completions',
      protocol: 'openai',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '
      },
      AuthKey: 'Authorization'
    },
    {
      name: 'siliconflow',
      hostname: 'api.siliconflow.cn',
      protocol: 'openai',
      apiSuffix: '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '
      },
      AuthKey: 'Authorization'
    }
  ];
  // Get configuration
  const config = vscode.workspace.getConfiguration('vscode-git-commit-message-generator');
  const provider = config.get<string>('llm.provider') || 'aliyun';
  let apiUrl = '';
  let model = '';
  let apiKey = '';
  let protocol = 'openai';
  const temperature = config.get<number>('llm.temperature') || 0.7;
  const topP = config.get<number>('llm.top_p') || 1;
  const maxTokens = config.get<number>('llm.max_tokens') || 2048;
  if (provider == "custom") {
    apiUrl = config.get<string>(`providers.${provider}.url`) || '';
    const oldApiUrl = config.get<string>('llm.url') || '';
    const oldProtocol = config.get<string>('llm.protocol') || '';
    const oldModel = config.get<string>('llm.model') || '';
    const oldApiKey = config.get<string>('llm.apiKey') || '';
    if (apiUrl == '' && oldApiUrl != '') {
      apiUrl = oldApiUrl;
      try {
        config.update(`providers.${provider}.url`, oldApiUrl, vscode.ConfigurationTarget.Global);
        config.update(`providers.${provider}.protocol`, oldProtocol, vscode.ConfigurationTarget.Global);
        config.update(`providers.${provider}.apiKey`, oldApiKey, vscode.ConfigurationTarget.Global);
        config.update(`providers.${provider}.model`, oldModel, vscode.ConfigurationTarget.Global);
      } catch (error) {
        console.error('Failed to update configuration:', error);
        vscode.window.showErrorMessage(`Failed to sync ${provider} configuration: ${error}`);
      }
    }
    model = config.get<string>(`providers.${provider}.model`) || oldModel || '';
    protocol = config.get<string>(`providers.${provider}.protocol`) || oldProtocol || 'openai';
    apiKey = config.get<string>(`providers.${provider}.apiKey`) || oldApiKey || '';
  } else {
    // Get provider preset configuration
    const providerPresets = getProviderPresets();
    const preset = providerPresets[provider];

    if (!preset) {
      console.warn(`Provider preset configuration not found for ${provider}`);
    }
    apiUrl = config.get<string>(`providers.${provider}.url`) || preset?.url || '';
    model = config.get<string>(`providers.${provider}.model`) || preset?.model || '';
    protocol = config.get<string>(`providers.${provider}.protocol`) || preset?.protocol || 'openai';
    apiKey = config.get<string>(`providers.${provider}.apiKey`) || '';
  }

  // Get prompt template and system instruction from configuration
  const promptTemplate = config.get<string>('llm.prompt') || `Generate a commit message from the following changes using the Conventional Commits 1.0.0 specification.\nFiles:\n\${files}\nDiff:\n\${diff}`;
  const system = config.get<string>('llm.system') || `You are an assistant that writes Git commit messages following Conventional Commits 1.0.0. Use this structure: <type>[optional scope][!]: <description>. Types must be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Keep the subject concise and imperative. Use lowercase type and scope. Add body and footer only when needed by the changes.`

  // Replace template variables
  const prompt = promptTemplate
    .replace(/\$\{files\}/g, stagedFiles.join('\n'))
    .replace(/\$\{diff\}/g, diffContent);

  // Parse URL (more robust handling for custom user endpoints)
  if (!apiUrl) {
    console.warn(`[committer] llm apiUrl is empty, provider=${provider}, please check extension configuration`);
  }
  const parsedUrl = url.parse(apiUrl || '');
  const isHttps = parsedUrl.protocol === 'https:';
  const parsedHostname = parsedUrl.hostname || '';

  // Get matching service config (first try parsed hostname)
  let serviceConfig = modelServices.find(service => service.hostname === parsedHostname);
  if (!serviceConfig) {
    let serviceName = '';
    switch (protocol) {
      case 'ollama':
        serviceName = 'ollama';
        break;
      case 'gemini':
        serviceName = 'gemini';
        break;
      case 'openai':
      default:
        serviceName = 'openai';
        break;
    }
    serviceConfig = modelServices.find(service => service.name === serviceName);
  }
  if (!serviceConfig) {
    throw new Error(`No matching LLM service configuration found: ${parsedHostname || apiUrl}`);
  }

  // Use parsed hostname as final value; fallback to serviceConfig hostname when empty
  const hostname = parsedHostname || serviceConfig.hostname || 'localhost';
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80);

  // Compute request path to avoid duplicate concatenation or missing slash
  const basePath = parsedUrl.pathname || parsedUrl.path || '';
  const suffix = serviceConfig.apiSuffix || '';
  let path = basePath || '';
  if (suffix) {
    if (!path.endsWith(suffix)) {
      // Handle slashes to avoid // or missing /
      if (path.endsWith('/') && suffix.startsWith('/')) {
        path = path.slice(0, -1) + suffix;
      } else if (!path.endsWith('/') && !suffix.startsWith('/')) {
        path = path + '/' + suffix;
      } else {
        path = path + suffix;
      }
    }
  }
  if (!path) path = '/';
  console.log(`[committer] resolved apiUrl=${apiUrl} host=${hostname} port=${port} path=${path}`);
  let requestData = {};
  switch (serviceConfig.name.toLowerCase()) {
    case "aliyun":
      requestData = {
        model: model,
        messages: [
          {
            role: 'system',
            content: system
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        stream: true
      };
      break;
    case "anthropic":
      requestData = {
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        system: system,
        max_tokens: maxTokens,
        temperature: temperature,
        stream: true
      };
      break;
    case "tencent":
      requestData = {
        model: model,
        messages: [
          {
            role: 'system',
            content: system
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature,
        enable_enhancement: false,
        top_p: topP,
        max_tokens: maxTokens,
        stream: true
      };
      break;
    case "deepseek":
      requestData = {
        model: model,
        messages: [
          {
            role: 'system',
            content: system
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream: true
      };
      break;
    case "siliconflow":
      requestData = {
        model: model,
        messages: [
          {
            role: 'system',
            content: system
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream: true
      };
      break;
      case "openai":
        requestData = {
          model: model,
          messages: [
            {
              role: 'system',
              content: system
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: temperature,
          top_p: topP,
          max_tokens: maxTokens,
          stream: true
        };
        break;
    case "ollama":
        requestData = {
          model: model,
          system: system,
          prompt: prompt,
          temperature: temperature,
          top_p: topP,
          max_tokens: maxTokens,
          stream: true
        };
        break;
      case "gemini":
        requestData = {
          contents: [
            {
              parts: [
                {
                  text: `${system}\n\nFiles:\n${stagedFiles.join('\n')}\n\nDiff:\n${diffContent}`
                }
              ]
            }
          ]
        };
        break;
  }
  
  console.log('[committer] requestData:', requestData);

  // Create request options
  const options = {
    hostname: hostname,
    port: port,
    path: path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  options.headers = { ...(serviceConfig.headers || {}) };
  if (apiKey && serviceConfig.AuthKey && typeof serviceConfig.AuthKey === 'string') {
    const authKey = serviceConfig.AuthKey as keyof typeof options.headers;
    const existingValue = options.headers[authKey];
    options.headers[authKey] = (existingValue !== undefined ? String(existingValue) : '') + apiKey;
  }
  const optionsStr = JSON.stringify(options);
  console.log(`[committer] LLM API request: ${optionsStr}`+'\n');

  return new Promise((resolve, reject) => {
    // Choose http or https module
    const requester = isHttps ? https : http;
    
    const req = requester.request(options, (res) => {
      
      let generatedText = '';
      let generatedThinking = '';
      let isThinking = false;
      let rawResponse = '';

      res.on('data', (chunk) => {
        rawResponse += chunk.toString();
        if (serviceConfig?.protocol === 'gemini') {
          return;
        }
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
        
        for (const line of lines) {
          try {
            // Strip all characters before the JSON object and keep only content from {
            const jsonStartIndex = line.indexOf('{');
            if (jsonStartIndex === -1) {
              continue;
            }
            const jsonStr = line.substring(jsonStartIndex);
            const response = JSON.parse(jsonStr);
            
            if (!serviceConfig) {
              throw new Error('No matching LLM service configuration found');
            }
            
            switch (serviceConfig.protocol) {
              case "openai":
                if (response.choices){
                  // Handle streaming delta (existing logic)
                  if(response.choices[0]?.delta?.content) {
                    let content = response.choices[0].delta.content;
                    if (isThinking) {
                      content = content.replace(/^\n+/, ' ');
                      generatedThinking += content;
                    } else {
                      if (generatedText === '') {
                        content = content.replace(/^\n+/, '');
                      } else {
                        content = content.replace(/^```[a-z0-9]+\n/g, '').replace(/```/g, '');
                      }
                      generatedText += content;
                    }
                    if (generatedText.match(/^<think>/)) {
                      generatedThinking = generatedText.replace(/^<think>/, '');
                      generatedText = '';
                      isThinking = true;
                    }
                    const thinkEndMatch = generatedThinking.match(/<\/think>(.*)$/);
                    if (thinkEndMatch) {
                      isThinking = false;
                      generatedText = thinkEndMatch[1].replace(/^\n+/, '');
                      generatedThinking = generatedThinking.replace(/<\/think>.*$/, '');
                    }
                    if (isThinking) {
                      statusBarMessage.text = generatedThinking;
                      statusBarMessage.show();
                      if (generatedThinking.length > 30) {
                        generatedThinking = '';
                      }
                    } else {
                      inputBox.value = generatedText;
                    }
                  }
                  if(response.choices[0]?.delta?.reasoning_content) {
                    if (generatedThinking.length > 30) {
                      generatedThinking = '';
                    }
                    generatedThinking += response.choices[0].delta.reasoning_content.replace(/\n/g, ' ');
                    statusBarMessage.text = generatedThinking;
                    statusBarMessage.show();
                  }

                  // Handle non-streaming (single response) output: OpenAI Chat Completions or Completions
                  const choice = response.choices[0];
                  if (choice) {
                    // Chat completion: message.content may be a string or object (with parts)
                    let fullContent = '';
                    if (choice.message && choice.message.content) {
                      const mc = choice.message.content as any;
                      if (typeof mc === 'string') {
                        fullContent = mc;
                      } else if (Array.isArray(mc.parts)) {
                        fullContent = mc.parts.join('');
                      } else {
                        try {
                          fullContent = JSON.stringify(mc);
                        } catch (e) {
                          fullContent = String(mc);
                        }
                      }
                    } else if (choice.text) {
                      // text field returned by Completion API
                      fullContent = choice.text as string;
                    }

                    if (fullContent) {
                      // Clean code blocks and handle <think> tags (consistent with streaming logic)
                      fullContent = fullContent.replace(/^```[a-z0-9]+\n/g, '').replace(/```/g, '');
                      if (fullContent.match(/^<think>/)) {
                        generatedThinking = fullContent.replace(/^<think>/, '');
                        generatedText = '';
                        isThinking = true;
                      } else {
                        generatedText += fullContent;
                      }

                      if (isThinking) {
                        statusBarMessage.text = generatedThinking;
                        statusBarMessage.show();
                      } else {
                        inputBox.value = generatedText;
                      }
                    }
                  }
                }
                break;
            case "ollama":
              default:
                if (response.response) {
                  let content = response.response;
                  if (isThinking) {
                    content = content.replace(/^\n+/, ' ')
                    generatedThinking += content;
                  } else {
                    if (generatedText === '') {
                      content = content.replace(/^\n+/, '');
                    }
                    generatedText += content;
                  }
                  if (generatedText.match(/^<think>/)) {
                    generatedThinking = generatedText.replace(/^<think>/, '');
                    generatedText = '';
                    isThinking = true;
                  }
                  const thinkEndMatch = generatedThinking.match(/<\/think>(.*)$/);
                  if (thinkEndMatch) {
                    isThinking = false;
                    generatedText = thinkEndMatch[1].replace(/^\n+/, '');
                    generatedThinking = generatedThinking.replace(/<\/think>.*$/, '');
                  }
                  if (isThinking) {
                    statusBarMessage.text = generatedThinking;
                    statusBarMessage.show();
                    if (generatedThinking.length > 30) {
                      generatedThinking = '';
                    }
                  } else {
                    inputBox.value = generatedText;
                  }
                  console.log('[committer]', generatedText, generatedThinking)
                }
                break;
            }
          } catch (error) {
            // If JSON parsing fails, it may be due to receiving an incomplete data chunk
            console.log('Failed to parse data chunk, skipped:', error);
          }
        }
      });
      
      res.on('end', () => {
        if (serviceConfig?.protocol === 'gemini') {
          try {
            const response = JSON.parse(rawResponse);
            const geminiText = response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (typeof geminiText === 'string' && geminiText.trim()) {
              resolve(geminiText.trim().replace(/^```[a-zA-Z0-9]*\n|```/g, ''));
              return;
            }
            const errorMessage = response?.error?.message || 'No valid Gemini response data received';
            reject(new Error(`Gemini API error: ${errorMessage}`));
            return;
          } catch (error) {
            reject(new Error(`Gemini response parse error: ${error instanceof Error ? error.message : String(error)}`));
            return;
          }
        }
        if (generatedText) {
          resolve(generatedText.trim().replace(/^```[a-zA-Z0-9]*\n|```/g, ''));
        } else {
          reject(new Error('No valid response data received'));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`API request error: ${error.message}`));
    });
    
    // Send request payload
    req.write(JSON.stringify(requestData));
    req.end();
  });
}

/**
 * Generate commit message from staged files and diff content
 */
async function generateCommitMessage(stagedFiles: string[], diffContent: string, inputBox: any, statusBarMessage: vscode.StatusBarItem): Promise<string> {
  try {
    // Call LLM API to generate commit message
    return await callLLMAPI(stagedFiles, diffContent, inputBox, statusBarMessage);
  } catch (error) {
    console.error('Failed to call LLM API:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to call LLM API: ${errorMessage}`);
    
    // If API call fails, fallback to local generation logic
    return generateLocalCommitMessage(stagedFiles, diffContent);
  }
}

/**
 * Fallback method for local commit message generation
 */
function generateLocalCommitMessage(stagedFiles: string[], diffContent: string): string {
  const normalizedFiles = stagedFiles.map(file => file.trim());
  const deletedFiles = normalizedFiles.filter(file => file.includes('(deleted)'));
  const nonDeletedFiles = normalizedFiles.filter(file => !file.includes('(deleted)'));
  const hasTestChange = nonDeletedFiles.some(file => file.includes('test') || file.includes('spec'));
  const hasBugFixSignal = /\b(fix|bug|issue|hotfix|patch)\b/i.test(diffContent);

  let prefix = '';
  
  // Determine prefix based on change type
  if (deletedFiles.length > 0 && nonDeletedFiles.length === 0) {
    prefix = 'chore: ';
  } else if (hasTestChange) {
    prefix = 'test: ';
  } else if (hasBugFixSignal) {
    prefix = 'fix: ';
  } else if (nonDeletedFiles.length > 0) {
    prefix = 'feat: ';
  } else {
    prefix = 'chore: ';
  }

  // Generate a simple description
  let description = '';
  
  if (normalizedFiles.length === 1) {
    // If there is only one file, use the filename as part of the description
    const fileName = normalizedFiles[0].replace(' (deleted)', '').split(' ').pop() || '';
    const fileNameWithoutExt = fileName.split('.').shift() || '';
    
    if (deletedFiles.length === 1) {
      // Provide a more specific description for deleted files
      description = `remove ${fileNameWithoutExt}`;
    } else if (hasBugFixSignal) {
      description = `fix ${fileNameWithoutExt} behavior`;
    } else {
      description = `update ${fileNameWithoutExt}`;
    }
  } else {
    // Multiple-file scenario
    if (deletedFiles.length > 0 && nonDeletedFiles.length === 0) {
      description = `remove files, total ${deletedFiles.length}`;
    } else if (hasBugFixSignal) {
      description = `resolve issues across ${nonDeletedFiles.length} files`;
    } else {
      description = `update code across ${normalizedFiles.length} files`;
    }
  }

  return `${prefix}${description}`;
}

/**
 * Get preset configurations for each provider
 */
function getProviderPresets(): Record<string, any> {
  return {
    'aliyun': {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: 'deepseek-r1-distill-llama-70b',
      protocol: 'openai'
    },
    'openai': {
      url: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      protocol: 'openai'
    },
    'ollama': {
      url: 'http://localhost:11434/api/generate',
      model: 'deepseek-r1:7b',
      protocol: 'ollama'
    },
    'deepseek': {
      url: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      protocol: 'openai'
    },
    'anthropic': {
      url: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-haiku-20240307',
      protocol: 'anthropic'
    },
    'tencent': {
      url: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions',
      model: 'hunyuan-lite',
      protocol: 'openai'
    },
    'siliconflow': {
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      model: 'deepseek-ai/DeepSeek-V3',
      protocol: 'openai'
    },
    'gemini': {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      model: 'gemini-2.5-flash',
      protocol: 'gemini'
    },
    'volcengine': {
      url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      model: 'deepseek-v3-250324',
      protocol: 'openai'
    },
    'custom': {
      url: '',
      model: '',
      protocol: 'openai'
    }
  };
}

export function deactivate() {}
