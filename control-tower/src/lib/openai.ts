// src/lib/openai.ts
import { getTenantOpenAIClient } from "@/lib/tenantOpenAI";

export async function getOpenAIClient(input: { tenantId: string; integrationKey?: string }) {
  return getTenantOpenAIClient(input);
}
