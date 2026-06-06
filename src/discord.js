'use strict';

// Lightweight Discord REST helpers using the global fetch (Node 18+).
// Used to connect a user's Discord bot for role verification and to relay
// new submissions to a Discord channel.

const API = 'https://discord.com/api/v10';

function authHeaders(botToken) {
  return {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  };
}

// Verify a bot token + guild are reachable. Returns { ok, bot, guild }.
async function checkBot(botToken, guildId) {
  if (!botToken) return { ok: false, error: 'Aucun token de bot fourni.' };
  try {
    const meRes = await fetch(`${API}/users/@me`, { headers: authHeaders(botToken) });
    if (!meRes.ok) {
      return { ok: false, error: `Token invalide (HTTP ${meRes.status}).` };
    }
    const bot = await meRes.json();
    let guild = null;
    if (guildId) {
      const gRes = await fetch(`${API}/guilds/${guildId}`, { headers: authHeaders(botToken) });
      if (gRes.ok) {
        guild = await gRes.json();
      } else {
        return {
          ok: false,
          bot,
          error: `Le bot n'a pas accès au serveur ${guildId} (HTTP ${gRes.status}). Invite le bot sur le serveur.`,
        };
      }
    }
    return { ok: true, bot, guild };
  } catch (err) {
    return { ok: false, error: `Erreur réseau: ${err.message}` };
  }
}

// Get a guild member's roles. Returns array of role IDs, or null on failure.
async function getMemberRoles(botToken, guildId, userId) {
  if (!botToken || !guildId || !userId) return null;
  try {
    const res = await fetch(`${API}/guilds/${guildId}/members/${userId}`, {
      headers: authHeaders(botToken),
    });
    if (!res.ok) return null;
    const member = await res.json();
    return Array.isArray(member.roles) ? member.roles : [];
  } catch (err) {
    return null;
  }
}

// Send a message (with optional embed) to a channel using the bot token.
async function sendMessage(botToken, channelId, payload) {
  if (!botToken || !channelId) return { ok: false, error: 'Bot ou salon non configuré.' };
  try {
    const res = await fetch(`${API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: authHeaders(botToken),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { checkBot, getMemberRoles, sendMessage };
