import { request } from 'undici';
import type { APIEmbed } from 'discord.js';

/** @internal */
export function sendDiscordMessage(webhookUrl: string, embeds: APIEmbed[]) {
  // Send a message to a Discord webhook
  return request(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds }),
  });
}
