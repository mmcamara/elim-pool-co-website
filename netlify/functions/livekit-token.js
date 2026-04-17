const { AccessToken } = require('livekit-server-sdk');
const { randomUUID } = require('crypto');

const AGENT_NAME = 'Moses-20b6';
const TOKEN_TTL = '10m';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return json(500, { error: 'LiveKit env vars not configured' });
  }

  const room = `elim-web-${randomUUID()}`;
  const identity = `visitor-${randomUUID()}`;

  const at = new AccessToken(apiKey, apiSecret, { identity, ttl: TOKEN_TTL });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  at.roomConfig = { agents: [{ agentName: AGENT_NAME }] };

  return json(200, { token: await at.toJwt(), url, room });
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
