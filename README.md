# Git Commit Message Generator

<p align="center">
  <img src="https://raw.githubusercontent.com/klaveriuzent/vscode-git-commit-generator/main/media/panda-avatar.png" alt="Git Commit Message Generator Logo" width="128" height="128">
</p>

Generate clear, conventional Git commit messages directly inside VS Code using your preferred AI provider.

---

## Table of Contents

- [What this extension does](#what-this-extension-does)
- [Who this is for](#who-this-is-for)
- [Key features](#key-features)
- [Quick start (5 minutes)](#quick-start-5-minutes)
- [How to use](#how-to-use)
- [Configuration](#configuration)
  - [1) Core settings](#1-core-settings)
  - [2) Provider settings](#2-provider-settings)
  - [3) Example `settings.json` (Gemini)](#3-example-settingsjson-gemini)
- [Supported providers](#supported-providers)
- [Tips for better commit messages](#tips-for-better-commit-messages)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## What this extension does

This extension reads your **staged Git changes**, sends a summary/diff to a configured LLM, and writes a commit message suggestion that follows **Conventional Commits** style.

In short, it helps you:

- write commit messages faster,
- keep message style consistent,
- reduce mental overhead when committing often.

---

## Who this is for

- Developers who want cleaner commit history.
- Teams that use Conventional Commits (`feat:`, `fix:`, `chore:`...).
- Beginners who are unsure how to phrase good commit messages.

---

## Key features

- ✅ One-click commit message generation from staged changes.
- ✅ Conventional-Commit-friendly output.
- ✅ Multiple providers supported (cloud and local).
- ✅ Configurable prompt, system instruction, and generation parameters.
- ✅ Works from Source Control UI in VS Code.

---

## Quick start (5 minutes)

1. Install **Git Commit Message Generator** from your extension source.
2. Open a Git repository in VS Code.
3. Open **Settings (JSON)**.
4. Add your provider config (example below uses Gemini).
5. Stage your files in Source Control.
6. Click **Generate Commit Message** in the Source Control toolbar.

Command ID used by this extension:

- `git-commit-generator.generateCommitMessage`

---

## How to use

1. Make code changes.
2. Stage files in Source Control (`+`) or via terminal (`git add ...`).
3. Run **Generate Commit Message** from the Source Control toolbar.
4. Review the generated message.
5. Edit if needed, then commit.

> Important: the generator works on **staged changes**. If nothing is staged, no message will be generated.

---

## Configuration

All settings are under the namespace:

- `git-commit-generator.*`

### 1) Core settings

- `git-commit-generator.llm.provider`  
  Select active provider. Options:
  `aliyun`, `openai`, `ollama`, `deepseek`, `anthropic`, `tencent`, `siliconflow`, `volcengine`, `gemini`, `custom`

- `git-commit-generator.llm.prompt`  
  Prompt template used for message generation.

- `git-commit-generator.llm.system`  
  System instruction for commit style.

- `git-commit-generator.llm.temperature`  
  Output randomness (0 to 1). Lower = more deterministic.

- `git-commit-generator.llm.top_p`  
  Nucleus sampling value (0 to 1).

- `git-commit-generator.llm.max_tokens`  
  Maximum generated token count.

### 2) Provider settings

Each provider uses this pattern:

- `git-commit-generator.providers.<provider>.url`
- `git-commit-generator.providers.<provider>.model`
- `git-commit-generator.providers.<provider>.apiKey`
- `git-commit-generator.providers.<provider>.protocol` (only for providers that require protocol selection)

Examples of `<provider>` values:

- `aliyun`
- `openai`
- `ollama`
- `deepseek`
- `anthropic`
- `tencent`
- `siliconflow`
- `volcengine`
- `gemini`
- `custom`

### 3) Example `settings.json` (Gemini)

```json
{
  "git-commit-generator.llm.provider": "gemini",
  "git-commit-generator.providers.gemini.apiKey": "YOUR_API_KEY",
  "git-commit-generator.providers.gemini.model": "gemini-1.5-flash"
}
```

---

## Supported providers

- Alibaba Bailian (`aliyun`)
- OpenAI (`openai`)
- Ollama local (`ollama`)
- DeepSeek (`deepseek`)
- Anthropic (`anthropic`)
- Tencent Hunyuan (`tencent`)
- SiliconFlow (`siliconflow`)
- Volcengine (`volcengine`)
- Gemini (`gemini`)
- Custom endpoint (`custom`)

---

## Tips for better commit messages

- Stage related files together (one logical change per commit).
- Keep commits small and focused.
- Review generated text before committing.
- Use scope when useful, e.g. `fix(auth): ...`.
- Prefer imperative style, e.g. “add”, “fix”, “refactor”.

---

## Troubleshooting

### 1) "No staged files" warning

Cause: no files are staged.

Fix:

- Stage files in Source Control, then run generator again.
- Or use terminal: `git add .`

### 2) Output language/style is not what you want

Fix:

- Customize `git-commit-generator.llm.prompt`
- Customize `git-commit-generator.llm.system`
- Lower `temperature` for more consistent output

### 3) API request failed

Check:

- Correct provider selected in `git-commit-generator.llm.provider`
- Valid `apiKey`
- Correct `url` and `model`
- Internet/network access for cloud providers

### 4) Local Ollama not responding

Check:

- Ollama service is running
- URL is reachable (commonly `http://localhost:11434/api/generate`)
- Model is installed locally

---

## FAQ

### Does this extension commit automatically?

No. It only generates the commit message. You still review and commit manually.

### Can I use my own OpenAI-compatible endpoint?

Yes. Use provider `custom` and set your endpoint/model/api key.

### Does it support team conventions?

Yes. You can enforce team style via `llm.system` and `llm.prompt`.

---

## Contributing

Issues and pull requests are welcome.

If you plan to contribute code, please:

1. Open an issue describing the change.
2. Keep PRs focused and small.
3. Include clear testing notes.

---

## Credits

Commit message format inspired by [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

Based on the original extension by chenkai2.  
Modified and maintained by klaveriuzent.

---

## License

MIT License
