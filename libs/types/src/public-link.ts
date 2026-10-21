import { z } from 'zod';

export const publicFlagSchema = z.object({ isPublic: z.boolean() });

export type PublicFlag = z.infer<typeof publicFlagSchema>;
