export type SocialProviderCatalogEntry = {
  id: string;
  label: string;
  documentationUrl: string;
};

export const socialProviderCatalog = [
  { id: "apple", label: "Apple", documentationUrl: "https://better-auth.com/docs/authentication/apple" },
  { id: "atlassian", label: "Atlassian", documentationUrl: "https://better-auth.com/docs/authentication/atlassian" },
  { id: "cognito", label: "Cognito", documentationUrl: "https://better-auth.com/docs/authentication/cognito" },
  { id: "discord", label: "Discord", documentationUrl: "https://better-auth.com/docs/authentication/discord" },
  { id: "dropbox", label: "Dropbox", documentationUrl: "https://better-auth.com/docs/authentication/dropbox" },
  { id: "facebook", label: "Facebook", documentationUrl: "https://better-auth.com/docs/authentication/facebook" },
  { id: "figma", label: "Figma", documentationUrl: "https://better-auth.com/docs/authentication/figma" },
  { id: "github", label: "GitHub", documentationUrl: "https://better-auth.com/docs/authentication/github" },
  { id: "gitlab", label: "GitLab", documentationUrl: "https://better-auth.com/docs/authentication/gitlab" },
  { id: "railway", label: "Railway", documentationUrl: "https://better-auth.com/docs/authentication/railway" },
  { id: "google", label: "Google", documentationUrl: "https://better-auth.com/docs/authentication/google" },
  { id: "huggingface", label: "Hugging Face", documentationUrl: "https://better-auth.com/docs/authentication/huggingface" },
  { id: "kakao", label: "Kakao", documentationUrl: "https://better-auth.com/docs/authentication/kakao" },
  { id: "kick", label: "Kick", documentationUrl: "https://better-auth.com/docs/authentication/kick" },
  { id: "line", label: "LINE", documentationUrl: "https://better-auth.com/docs/authentication/line" },
  { id: "linear", label: "Linear", documentationUrl: "https://better-auth.com/docs/authentication/linear" },
  { id: "linkedin", label: "LinkedIn", documentationUrl: "https://better-auth.com/docs/authentication/linkedin" },
  { id: "microsoft", label: "Microsoft", documentationUrl: "https://better-auth.com/docs/authentication/microsoft" },
  { id: "naver", label: "Naver", documentationUrl: "https://better-auth.com/docs/authentication/naver" },
  { id: "notion", label: "Notion", documentationUrl: "https://better-auth.com/docs/authentication/notion" },
  { id: "paybin", label: "Paybin", documentationUrl: "https://better-auth.com/docs/authentication/paybin" },
  { id: "paypal", label: "PayPal", documentationUrl: "https://better-auth.com/docs/authentication/paypal" },
  { id: "polar", label: "Polar", documentationUrl: "https://better-auth.com/docs/authentication/polar" },
  { id: "reddit", label: "Reddit", documentationUrl: "https://better-auth.com/docs/authentication/reddit" },
  { id: "roblox", label: "Roblox", documentationUrl: "https://better-auth.com/docs/authentication/roblox" },
  { id: "salesforce", label: "Salesforce", documentationUrl: "https://better-auth.com/docs/authentication/salesforce" },
  { id: "slack", label: "Slack", documentationUrl: "https://better-auth.com/docs/authentication/slack" },
  { id: "spotify", label: "Spotify", documentationUrl: "https://better-auth.com/docs/authentication/spotify" },
  { id: "tiktok", label: "TikTok", documentationUrl: "https://better-auth.com/docs/authentication/tiktok" },
  { id: "twitch", label: "Twitch", documentationUrl: "https://better-auth.com/docs/authentication/twitch" },
  { id: "twitter", label: "Twitter (X)", documentationUrl: "https://better-auth.com/docs/authentication/twitter" },
  { id: "vercel", label: "Vercel", documentationUrl: "https://better-auth.com/docs/authentication/vercel" },
  { id: "vk", label: "VK", documentationUrl: "https://better-auth.com/docs/authentication/vk" },
  { id: "wechat", label: "WeChat", documentationUrl: "https://better-auth.com/docs/authentication/wechat" },
  { id: "zoom", label: "Zoom", documentationUrl: "https://better-auth.com/docs/authentication/zoom" },
] as const satisfies readonly SocialProviderCatalogEntry[];

const socialProviderIds = new Set<string>(socialProviderCatalog.map((provider) => provider.id));

export function parseSocialProviderList(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function isSupportedSocialProvider(providerId: string) {
  return socialProviderIds.has(providerId);
}

export function getSocialProvider(providerId: string) {
  return socialProviderCatalog.find((provider) => provider.id === providerId) ?? null;
}

function providerEnvPrefix(providerId: string) {
  return providerId.replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

export function socialProviderEnvKeys(providerId: string) {
  const prefix = providerEnvPrefix(providerId);
  if (providerId === "tiktok") {
    return [`${prefix}_CLIENT_KEY`, `${prefix}_CLIENT_SECRET`];
  }
  return [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`];
}
