export enum Platform {
  Mac = 'mac',
  Other = 'other',
}

const MAC_PLATFORM_PATTERN = /mac/i;

type NavigatorWithUserAgentData = Navigator & { userAgentData?: { platform: string } };

export function detectPlatform(): Platform {
  const { userAgentData, platform } = navigator as NavigatorWithUserAgentData;
  const platformName = userAgentData ? userAgentData.platform : platform;
  return MAC_PLATFORM_PATTERN.test(platformName) ? Platform.Mac : Platform.Other;
}
