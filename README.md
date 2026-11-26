# mindfit
wellness app

## Connecting an AI agent (Duet)

`supabase/functions/mindfit-mcp` is an MCP server that gives an agent access to your areas and daily tasks.

1. Deploy it with JWT verification off (it checks its own key): `supabase functions deploy mindfit-mcp --no-verify-jwt`
2. In the app, click **Connect agent** (the robot icon), then **Create URL**, and copy the URL.
3. In Duet, add a custom connector and paste that URL as its MCP server URL.

Revoke a URL from the same screen. Only a hash of each key is stored.
