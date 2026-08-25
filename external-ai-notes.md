# External implementation notes

Source: https://developers.cloudflare.com/workers-ai/configuration/bindings/

Official Cloudflare Workers AI docs state that a Worker AI binding is configured with `[ai] binding = "AI"` and called server-side as `await env.AI.run(model, { prompt: "..." })`. The docs also support `{ stream: true }` for streamed responses. The project already has the `[ai] binding = "AI"` configuration.

Source: https://developers.cloudflare.com/workers-ai/models/

The current Cloudflare model catalog lists text-generation models, including `gpt-oss-20b` as a Cloudflare-hosted OpenAI model with reasoning/function-calling capabilities, and multilingual text-generation options. The implementation uses configurable `AI_MODEL` with default `@cf/openai/gpt-oss-20b`, while keeping Gemini as a secret-backed fallback.
Live D1 verification on 2026-08-25 returned all ten expected expansion tables: blog_posts, chat_conversations, chat_messages, cms_content, customer_sessions, offers, pos_sale_items, pos_sales, returns, and site_pages. Query succeeded with HTTP 200 against database 300aea86-ac31-46b9-aec4-2314f1a78b01.
