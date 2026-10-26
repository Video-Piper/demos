# Video Piper MCP server

Video Piper is an [MCP](https://modelcontextprotocol.io) server, so an AI assistant can list, import, edit, caption and embed your videos, and manage live streams, with your account's key. Every tool is an API call, with the same limits and billing.

| | |
|---|---|
| Server URL | `https://api.videopiper.dev/v1/mcp` |
| Transport | Streamable HTTP (stateless: POST only, JSON answers) |
| Auth | `Authorization: Bearer <your API key>` |

Use a test key (`vp_test_...`) while you try it out; it works on free test videos. Your key gives the assistant your account's access, so revoke it in Account > API keys if it leaks. Connectors added in Claude.ai's settings sign in with OAuth, which is not available yet; use one of the setups below. See the [MCP docs](https://videopiper.com/docs/ai-assistants/) for the tool list.

Replace `vpk_...` with your key in each config below.

## Claude Code

```sh
claude mcp add --transport http video-piper https://api.videopiper.dev/v1/mcp \
  --header "Authorization: Bearer $VIDEO_PIPER_API_KEY"
```

## Claude Desktop

Edit `claude_desktop_config.json`. It connects through the `mcp-remote` bridge, which needs Node.js.

```json
{
  "mcpServers": {
    "video-piper": {
      "command": "npx",
      "args": ["mcp-remote", "https://api.videopiper.dev/v1/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer vpk_..." }
    }
  }
}
```

## Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "video-piper": {
      "url": "https://api.videopiper.dev/v1/mcp",
      "headers": { "Authorization": "Bearer vpk_..." }
    }
  }
}
```

## VS Code

`.vscode/mcp.json`. VS Code asks for the key once and keeps it out of the file:

```json
{
  "inputs": [{ "type": "promptString", "id": "video-piper-key", "description": "Video Piper API key", "password": true }],
  "servers": {
    "video-piper": {
      "type": "http",
      "url": "https://api.videopiper.dev/v1/mcp",
      "headers": { "Authorization": "Bearer ${input:video-piper-key}" }
    }
  }
}
```

## Things to know

- Processing is asynchronous: a tool that makes a video returns its `videoId` right away, and the assistant checks on it with `get_video`.
- Local files do not go through MCP. Import from a public or pre-signed URL, or upload in the app or with the API (see the [quickstarts](../quickstart)).
- Tools that start work accept `dryRun` to check a request first. Destructive tools (`delete_video`, `cancel_processing`) make assistants ask you first.
- Try: "Cut the first 30 seconds of yesterday's demo and add captions", "Blur any API keys in my latest recording", "Give me an embed code for the onboarding video".
