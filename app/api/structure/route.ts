import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text field is required" },
        { status: 400 }
      );
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `あなたは会話テキストを構造化JSONに変換するアシスタントです。
入力された会話テキストを分析し、以下の形式のJSONのみを返してください。
説明文やマークダウンコードブロックは含めず、JSONのみを返してください。

{
  "title": "会話のタイトル（10文字以内）",
  "summary": "会話全体の要約（1〜2文）",
  "participants": ["会話の相手・登場人物の名前（不明なら「相手」など）"],
  "topics": [
    {
      "topic": "話題のタイトル",
      "content": "話題の詳細"
    }
  ],
  "key_points": ["課題・問題点・懸念事項のリスト（なければ空配列）"],
  "decisions": ["決まったこと・合意事項のリスト（なければ空配列）"],
  "actions": ["誰が何をするかのアクションアイテムリスト（なければ空配列）"],
  "emotional_notes": ["会話中の感情・雰囲気・空気感のメモ（例: 相手は不安そうだった）（なければ空配列）"],
  "next_steps": ["今後の予定・次のステップ（なければ空配列）"]
}`,
      messages: [
        {
          role: "user",
          content: `以下の会話テキストを構造化JSONに変換してください:\n\n${text}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const rawText = content.text.trim();
    // Strip markdown code fences if present
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = jsonMatch ? jsonMatch[1].trim() : rawText;

    const structured = JSON.parse(jsonText);
    return NextResponse.json(structured);
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse Claude response as JSON" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
