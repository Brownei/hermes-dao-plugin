# TensorZero Prompt Templates & Functions

Source: https://www.tensorzero.com/docs/gateway/create-a-prompt-template
Fetched: 2026-05-13

## Why create a prompt template?

- Decouple prompts from application code
- Collect structured inference datasets for future fine-tuning
- Implement model-specific prompts (different prompts for different models)

## Set up a prompt template

1. Create a MiniJinja template file (.minijinja):
   ```
   Share a fun fact about: {{ topic }}
   ```

2. Configure in variant using `templates.your_template_name.path`:
   ```toml
   [functions.fun_fact]
   type = "chat"

   [functions.fun_fact.variants.gpt_5_mini]
   type = "chat_completion"
   model = "openai::gpt-5-mini"
   templates.fun_fact_topic.path = "functions/fun_fact/gpt_5_mini/fun_fact_topic_template.minijinja"
   ```

3. Use during inference with `tensorzero::template` content block:
   ```python
   result = client.chat.completions.create(
       model="tensorzero::function_name::fun_fact",
       messages=[{
           "role": "user",
           "content": [{
               "type": "tensorzero::template",
               "name": "fun_fact_topic",
               "arguments": {"topic": "artificial intelligence"},
           }],
       }],
   )
   ```

## Set up a template schema

1. Create a JSON Schema for template variables:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "type": "object",
     "properties": {"topic": {"type": "string"}},
     "required": ["topic"],
     "additionalProperties": false
   }
   ```

2. Declare in function config using `schemas.your_schema_name.path`:
   ```toml
   [functions.fun_fact]
   type = "chat"
   schemas.fun_fact_topic.path = "functions/fun_fact/fun_fact_topic_schema.json"
   ```

## Re-use prompt snippets

Set `gateway.template_filesystem_access.base_path` to enable `{% include %}` and `{% import %}` directives.

## Migration from legacy format

- `system_template` → `templates.system.path`
- `system_schema` → `schemas.system.path`
- `user_template` → `templates.user.path`
- `user_schema` → `schemas.user.path`
- `assistant_template` → `templates.assistant.path`
- `assistant_schema` → `schemas.assistant.path`
