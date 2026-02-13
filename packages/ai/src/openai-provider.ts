import type { AiProvider, AskModelInput } from "./provider";
import { groundedAnswerSchema } from "./provider";
import type { Citation, GroundedAnswer } from "@internalwiki/core";

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  constructor(
    private readonly opts: {
      apiKey: string;
      model?: string;
      baseUrl?: string;
    }
  ) {}

  async answerQuestion(input: AskModelInput): Promise<GroundedAnswer> {
    const model = this.opts.model ?? "gpt-4.1-mini";
    const baseUrl = this.opts.baseUrl ?? "https://api.openai.com/v1";

    const formattedContext = input.contextChunks
      .map((chunk) => `chunk:${chunk.chunkId} score:${chunk.sourceScore} ${chunk.text}`)
      .join("\n\n");

    const prompt = [
      "Answer only using provided context. Include citations for every claim.",
      "Return JSON object with keys: answer, citations, confidence, sourceScore.",
      `Question: ${input.question}`,
      `Context:\n${formattedContext}`
    ].join("\n\n");

    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.apiKey}`
      },
      body: JSON.stringify({
        model,
        input: prompt,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI error (${response.status})`);
    }

    const body = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };

    const raw = body.output_text ?? body.output?.[0]?.content?.[0]?.text ?? "";
    const parsed = groundedAnswerSchema.parse(JSON.parse(raw));

    return parsed;
  }

  async summarize(input: { content: string; citations: Citation[] }): Promise<{ summary: string; citations: Citation[] }> {
    const excerpt = input.content.slice(0, 4000);
    return {
      summary: `Summary (generated): ${excerpt}`,
      citations: input.citations
    };
  }
}
