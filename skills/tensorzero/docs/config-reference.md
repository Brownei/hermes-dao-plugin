# TensorZero Configuration Reference

Source: https://www.tensorzero.com/docs/gateway/configuration-reference
Fetched: 2026-05-13

## [gateway]

The [gateway] section defines the behavior of the TensorZero Gateway.

### auth.cache.enabled
Type: boolean | Required: no (default: true)
Enable caching of authentication database queries.

### auth.cache.ttl_ms
Type: integer | Required: no (default: 1000)
TTL in milliseconds for cached authentication queries.

### auth.enabled
Type: boolean | Required: no (default: false)
Enable authentication for the TensorZero Gateway. All endpoints except /status and /health will require a valid API key. Requires Postgres.

### base_path
Type: string | Required: no (default: /)
If set, the gateway will prefix its HTTP endpoints with this base path.

### bind_address
Type: string | Required: no (default: [::]:3000)
Socket address to bind the gateway to. Can be IPv4 or IPv6. Also settable via --bind-address CLI flag or TENSORZERO_GATEWAY_BIND_ADDRESS env var.

### cache.valkey.ttl_s
Type: integer | Required: no (default: 86400 = 24 hours)
TTL in seconds for inference cache entries stored in Valkey.

### debug
Type: boolean | Required: no (default: false)
When true, the gateway will log more verbose errors for development debugging.

### disable_pseudonymous_usage_analytics
Type: boolean | Required: no (default: false)
If true, TensorZero will not collect pseudonymous usage analytics.

### export.otlp.traces.enabled
Type: boolean | Required: no (default: false)
Enable exporting traces to an OpenTelemetry-compatible observability system. Requires OTEL_EXPORTER_OTLP_TRACES_ENDPOINT env var.

### export.otlp.traces.extra_headers
Type: object (map of string to string) | Required: no (default: {})
Static headers to include in all OTLP trace export requests.

### export.otlp.traces.format
Type: either "opentelemetry" or "openinference" | Required: no (default: "opentelemetry")

### fetch_and_encode_input_files_before_inference
Type: boolean | Required: no (default: false)
If true, gateway fetches remote input files and sends as base64. Recommended for observability and reproducibility.

### global_outbound_http_timeout_ms
Type: integer | Required: no (default: 900000 = 15 minutes)
Global timeout in milliseconds for all outbound HTTP requests.

### observability.async_writes
Type: boolean | Required: no (default: true)
Offload database writes to background tasks. Cannot be enabled simultaneously with batch_writes.

### observability.batch_writes
Type: object | Required: no (default: disabled)
Batch database writes for improved latency/throughput. Fields: enabled (bool), flush_interval_ms (int, default 100), max_rows (int, default 1000), max_rows_postgres (int), write_queue_capacity (int, optional).

### observability.enabled
Type: boolean | Required: no (default: null)
Enable observability. If null, gateway logs warning but continues without DB.

### observability.disable_automatic_migrations
Type: boolean | Required: no (default: false)
Disable automatic DB migrations on launch. Run manually with --run-clickhouse-migrations.

### relay
Configure gateway relay to forward inference requests through another TensorZero Gateway.

#### relay.api_key_location
Type: string or object | Required: no
API key for relay gateway auth. Supports: env::VAR, dynamic::ARG, none, or {default, fallback} object.

#### relay.gateway_url
Type: string (URL) | Required: no
Base URL of the relay gateway to forward requests to.

### template_filesystem_access.base_path
Type: string | Required: no (default: disabled)
Set to allow MiniJinja templates to use {% include %} and {% import %} directives. Path is relative to config file.

## [models.model_name]

Defines a model. Provider-agnostic; providers are in the sub-section.

### routing
Type: array of strings | Required: yes
List of provider names to route requests to. First provider is primary; subsequent are fallbacks.

### skip_relay
Type: boolean | Required: no (default: false)
When true, this model bypasses the relay gateway and calls providers directly.

### timeouts
Type: object | Required: no
Granular timeouts:
- timeouts.non_streaming.total_ms — total time for non-streaming request
- timeouts.streaming.ttft_ms — time to first token
- timeouts.streaming.total_ms — total time for streaming request

### namespace
Type: string | Required: no
Scopes model to a specific namespace. Only usable by matching namespace experimentation config.

## [models.model_name.providers.provider_name]

Defines a specific provider for a model. Multiple providers allowed.

### type
Type: string | Required: yes
Provider type. Supported values: "openai", "anthropic", "gcp_vertex_gemini", "aws_bedrock", "fireworks", "together", "google_ai_studio_gemini", "azure", "mistral", "deepseek", "xai", "vllm", "sglang", "dummy"

### api_key_location
Type: string or object | Required: varies
API key location. Supports: env::VAR, dynamic::ARG, none, or {default, fallback} object.

### api_base
Type: string | Required: varies (required for "openai" type)
Base URL for the provider's API.

### model_name
Type: string | Required: yes (for most types)
The model name to use when calling the provider.

### extra_body
Type: object | Required: no
Extra JSON fields to include in the request body to the provider.

### extra_headers
Type: object | Required: no
Extra HTTP headers to include in requests to the provider.

### cost
Type: array of objects | Required: no
Configures cost tracking. Each entry has: pointer (JSON Pointer), cost_per_million or cost_per_unit.

### batch_cost
Type: array of objects | Required: no
Cost tracking for batch inferences. Single pointer (not split streaming/non-streaming).

### discard_unknown_chunks
Type: boolean | Required: no (default: false)
Discard unknown streaming chunks from the provider instead of erroring.

### timeouts
Type: object | Required: no
Provider-level timeouts. Same structure as model-level timeouts. More specific than model-level.

## [functions.function_name]

Defines an LLM function. Functions are the primary way to interact with TensorZero.

### type
Type: string | Required: yes
Function type. Supported: "chat", "json", "best_of_n_sample"

### description
Type: string | Required: no
Human-readable description of the function.

### system_schema
Type: object with path field | Required: no
JSON schema for validating the system message. path is relative to config file.

### user_schema
Type: object with path field | Required: no
JSON schema for validating the user message.

### assistant_schema
Type: object with path field | Required: no
JSON schema for validating the assistant message.

## [functions.function_name.variants.variant_name]

Defines a variant of a function. Multiple variants enable A/B testing.

### type
Type: string | Required: yes
Variant type. Supported: "chat_completion", "best_of_n"

For chat_completion variants:
- model — model name (key from [models.*])
- templates.system.path — path to system prompt template (.minijinja)
- templates.user.path — path to user prompt template
- templates.assistant.path — path to assistant prompt template
- json_mode — "off", "strict", or "on"
- allowed_tools — list of tool names this variant can use
- dynamic_template — enable dynamic template selection

## [metrics.metric_name]

Defines a metric for tracking function performance.

### type
Type: string | Required: yes
Metric type: "boolean", "float", "comment"

### level
Type: string | Required: yes
Metric level: "inference" (per-request) or "episode" (across multiple inferences)

### optimize
Type: string | Required: no
Optimization direction: "max" or "min"

### description
Type: string | Required: no
Human-readable description of the metric.

## [tools.tool_name]

Defines a tool that can be used by the LLM.

### name
Type: string | Required: no (default: tool_name from TOML key)
The name of the tool as seen by the LLM.

### description
Type: string | Required: yes
Description of the tool for the LLM.

### parameters
Type: object | Required: yes
JSON schema for the tool's parameters.

### strict
Type: boolean | Required: no (default: true)
Whether to enforce strict parameter validation.

## [object_storage]

Configures object storage for large inputs/outputs.

### type
Type: string | Required: yes
Storage type: "filesystem" or "s3_compatible"

## [postgres]

Configures the Postgres connection for observability.

### connection_pool_size
Type: integer | Required: no
Connection pool size for Postgres.

## [rate_limiting]

Configures rate limiting for the gateway.

### enabled
Type: boolean | Required: no (default: false)
Enable rate limiting.

### default_cost
Type: integer | Required: no (default: 1)
Default cost for requests without a matching rule.

### [[rate_limiting.rules]]
Rate limit rules. Each rule has:
- scope — "global" or per-model
- limit — maximum requests per window
- window_seconds — time window
- priority — rule priority (higher = checked first)
- always — whether rule always applies
