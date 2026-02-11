# Git Commit Message Generator

<p align="center">
  <img src="https://raw.githubusercontent.com/klaveriuzent/vscode-git-commit-generator/main/media/panda-avatar.png" alt="Git Commit Message Generator Logo" width="128" height="128">
</p>

A powerful Git commit message generator that uses AI models to automatically analyze staged code changes and generate well-structured, standardized commit messages.

---

## Features

- 🤖 Automatically analyzes code changes using AI models  
- 🔄 Supports multiple LLM services (Ollama, OpenAI, 阿里云百炼, 火山引擎, etc.)  
- 🌍 Supports multilingual commit messages (Chinese, English, and more)  
- ⚙️ Customizable prompt templates and generation parameters  
- 🎨 Clean and intuitive user interface  
- 🚀 Displays reasoning process for supported models, with local Ollama support  

---

## Installation

1. Open the VS Code Extensions Marketplace  
2. Search for **Git Commit Message Generator**  
3. Click **Install**

---


## Troubleshooting

### `Extension 'chenkai2.vscode-git-commit-message-generator' not found.`

This message usually means VS Code cannot find the extension in the current registry (for example, it may not be available in your Marketplace region or is only published as a VSIX/Open VSX package).

Try one of these options:

1. Install from a packaged release (`.vsix`) if available:
   - `code --install-extension <path-to-vsix-file>`
2. If you use VSCodium/Open VSX, install from Open VSX:
   - `ovsx install chenkai2.vscode-git-commit-message-generator`
3. Verify the extension ID and source registry in your environment before retrying.

### `没有暂存的文件，请先添加文件到暂存区`

This warning appears when no staged changes are detected in the current repository.

To fix it:

1. Stage specific files from Source Control (`+` button), then run **Generate Commit Message** again.
2. Or stage everything from terminal:
   - `git add .`
3. In the latest version, the extension also provides **Stage All and Retry** when it detects unstaged changes.

### Why commit messages may appear in Chinese

Older versions used Chinese defaults for `llm.prompt` and `llm.system`, so generated messages could be in Chinese even when your IDE is in English.

Use the latest version, or override these settings in VS Code to enforce English output.

## Usage

1. Configure your AI service API settings in VS Code
   - By default, the extension uses **阿里云百炼** with the model `deepseek-r1-distill-llama-70b`
     - Get an API key: [阿里云百炼](https://bailian.console.aliyun.com/?apiKey=1#/api-key)
     - After generating an API key, you can directly use multiple models. New users receive **1,000,000 free tokens per model for 6 months**. Available models include:
       - `deepseek-v3`
       - `deepseek-r1`
       - `qwen2.5-32b-instruct`
       - `deepseek-r1-distill-qwen-32b`
       - `qwen-plus`
       - `deepseek-r1-distill-llama-70b` (free, but may be slow due to high usage)
       - `qwen2-7b-instruct`
   - **火山引擎** is also recommended. Until **August 31, 2025**, each model provides **500,000 free tokens per day**
     - After generating an API key, you must manually enable the required models
     - Supported models are limited, mainly DeepSeek and Doubao series, for example:
       - `deepseek-r1-250120` – 500k tokens/day
       - `deepseek-r1-distill-qwen-32b-250120` – 500k tokens/day
       - `deepseek-v3-250324` – 500k tokens/day (recommended)
       - `doubao-1-5-pro-256k-250115` – 500k tokens/day
   - Other OpenAI-compatible services are supported, such as Tencent Yuanbao, Anthropic, SiliconFlow, and DeepSeek
   - Local Ollama deployments are supported. Simply set `protocol` to `ollama` and `url` to `http://localhost:11434/api/generate`

2. In the Git Source Control view, stage the files you want to commit  
3. Click the **Generate Commit Message** button in the toolbar  
4. The extension will analyze the staged changes and generate a standardized commit message  
5. For models with reasoning capabilities (such as DeepSeek), the reasoning process will be displayed in the status bar  

---

## Configuration

You can customize the following settings in VS Code:

- `llm.prompt`: Prompt template used to generate commit messages  
- `llm.system`: System instruction  
- `llm.temperature`: Randomness of the generated result (0–1)  
- `llm.top_p`: Cumulative probability threshold during sampling (0–1)  
- `llm.max_tokens`: Maximum number of tokens in the generated result  
- Provider-specific settings such as `url`, `model`, and `apiKey`

---

## Supported LLM Services

- Ollama (local deployment)  
- OpenAI  
- 阿里云百炼  
- 火山引擎  
- Anthropic  
- 腾讯混元  
- DeepSeek  
- SiliconFlow  
- Custom OpenAI-compatible services  

---

## Credits

Commit message format inspired by  
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)

Based on the original extension by chenkai2  
Modified and maintained by klaveriuzent

---

## Contributing

Issues and feature requests are welcome!  
If you’d like to contribute code, feel free to submit a pull request.

---

## License

MIT License