export enum Platform {
  Mac = 'mac',
  Other = 'other',
}

const MAC_PLATFORM_PATTERN = /mac/i;

type NavigatorWithUserAgentData = Navigator & { userAgentData?: { platform: string } };

function platformName(): string {
  const { userAgentData, platform } = navigator as NavigatorWithUserAgentData;
  if (platform !== '') return platform;
  return userAgentData ? userAgentData.platform : '';
}

export function detectPlatform(): Platform {
  return MAC_PLATFORM_PATTERN.test(platformName()) ? Platform.Mac : Platform.Other;
}
