// Базовые типы для всего проекта

export interface Vector2 {
  x: number;
  y: number;
}

export interface TokenState {
  id: string;
  position: Vector2;
  rotation: number;
  hidden: boolean;
  conditions: string[];
  hp: number;
  maxHp: number;
  ownerId: string | null;
  lockedBy: string | null;
}

export interface LightSource {
  id: string;
  position: Vector2;
  radius: number;
  color: string;
  intensity: number;
  flicker: boolean;
}

// Zod схемы для валидации API запросов
import { z } from 'zod';

export const TokenStateSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  rotation: z.number().min(0).max(360),
  hidden: z.boolean(),
  conditions: z.array(z.string()),
  hp: z.number(),
  maxHp: z.number().positive(),
  ownerId: z.string().nullable(),
  lockedBy: z.string().nullable(),
});

export const CampaignSchema = z.object({
  name: z.string().min(1).max(100),
  system: z.enum(['dnd5e', 'pf2e']),
});