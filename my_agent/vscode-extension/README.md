# My Agent VS Code Extension

VS Code extension for My Agent - an AI-powered coding assistant.

## Features

- **Chat Interface**: Interactive chat with My Agent in the sidebar
- **Command Palette Integration**: Access My Agent commands from the command palette
- **Configuration**: Customize AI provider and settings
- **Real-time Responses**: Get AI responses directly in VS Code

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "My Agent"
4. Click Install
5. Reload VS Code

## Configuration

1. Go to Settings (File > Preferences > Settings)
2. Search for "My Agent"
3. Configure the following settings:
   - `my-agent.apiKey`: API key for your AI provider
   - `my-agent.provider`: AI provider (glm, anthropic, openai, gemini)
   - `my-agent.model`: AI model to use (optional)
   - `my-agent.baseUrl`: Base URL for AI provider API (optional)

## Usage

### Via Command Palette
1. Press Ctrl+Shift+P to open the command palette
2. Type "My Agent" to see available commands
3. Select a command:
   - `My Agent: Start Agent`: Start the agent
   - `My Agent: Ask a Question`: Ask a question to the agent
   - `My Agent: Clear Chat`: Clear the chat history

### Via Sidebar
1. Open the My Agent sidebar from the Explorer view
2. Type your question in the input box
3. Press Enter or click Send
4. View the agent's response in the chat window

### Via Keyboard Shortcut
- Press Ctrl+Shift+A (Windows/Linux) or Cmd+Shift+A (Mac) to open the ask question input

## Supported AI Providers

- **GLM** (Default): Google Language Model
- **Anthropic**: Claude models
- **OpenAI**: GPT models
- **Gemini**: Google Gemini models

## Troubleshooting

### API Key Issues
- Make sure your API key is correct and has the necessary permissions
- Check your internet connection
- Verify that your AI provider is accessible

### Extension Not Loading
- Try reloading VS Code
- Check the VS Code Developer Console for errors
- Ensure you have the required VS Code version (1.80.0 or higher)

## Development

1. Clone the repository
2. Navigate to the `vscode-extension` directory
3. Run `npm install` to install dependencies
4. Run `npm run compile` to build the extension
5. Press F5 to launch the extension in debug mode

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License