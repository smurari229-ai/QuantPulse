type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = { status: (code: number) => ApiResponse; json: (body: unknown) => unknown; setHeader: (name: string, value: string) => void };

const MAX_INPUT_BYTES = 100_000;
const MAX_AI_RESPONSE_BYTES = 20_000;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM_LENGTH = 500;
import { GoogleGenAI } from '@google/genai';

const SIGNALS = new Set(['BUY', 'SELL', 'HOLD', 'NO_TRADE']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateDecision(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('AI response must be an object.');
  const d = value as Record<string, unknown>;
  if (!SIGNALS.has(String(d.signal))) throw new Error('AI response contains an invalid signal.');
  if (!isFiniteNumber(d.confidence) || d.confidence < 0 || d.confidence > 1) throw new Error('AI confidence must be between 0 and 1.');
  if (typeof d.reasoning !== 'string' || d.reasoning.length === 0 || d.reasoning.length > 4000) throw new Error('AI reasoning is invalid.');
  if (typeof d.strategy !== 'string' || d.strategy.trim().length === 0 || d.strategy.length > 200) throw new Error('AI strategy is invalid.');
  if (!Array.isArray(d.risk_flags) || d.risk_flags.length > MAX_LIST_ITEMS || !d.risk_flags.every((x) => typeof x === 'string' && x.length <= MAX_LIST_ITEM_LENGTH)) throw new Error('AI risk flags are invalid.');
  if (!Array.isArray(d.required_checks) || d.required_checks.length > MAX_LIST_ITEMS || !d.required_checks.every((x) => typeof x === 'string' && x.length <= MAX_LIST_ITEM_LENGTH)) throw new Error('AI required checks are invalid.');
  return d;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Real AI is not configured. Add GEMINI_API_KEY as a server-side environment variable.' });

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const bodyJson = JSON.stringify(body);
    if (new TextEncoder().encode(bodyJson).byteLength > MAX_INPUT_BYTES) return res.status(413).json({ error: 'AI request payload is too large.' });
    const rawInput = body.input;
    if (!rawInput || typeof rawInput !== 'object') return res.status(400).json({ error: 'Missing AI feature input.' });
    const input = rawInput as Record<string, any>;

    const indicators = input.indicators as Record<string, unknown> | undefined;
    const conditions = input.currentMarketConditions as Record<string, unknown> | undefined;
    const requiredNumbers = [
      input.currentPrice, indicators?.ema20, indicators?.ema50, indicators?.ema200,
      indicators?.rsi14, indicators?.atr14, indicators?.relativeVolume,
      conditions?.spreadBps, conditions?.dataStalenessMs,
    ];
    const invalidNumericInput = requiredNumbers.some((value) => value !== undefined && !isFiniteNumber(value));
    const unsafeMarketInput = !isFiniteNumber(input.currentPrice) || input.currentPrice <= 0
      || !conditions || !isFiniteNumber(conditions.spreadBps) || conditions.spreadBps < 0
      || !isFiniteNumber(conditions.dataStalenessMs) || conditions.dataStalenessMs < 0
      || conditions.dataStalenessMs > 3000
      || !indicators || !isFiniteNumber(indicators.rsi14) || indicators.rsi14 < 0 || indicators.rsi14 > 100
      || !isFiniteNumber(indicators.atr14) || indicators.atr14 < 0;
    const unsafeNewsInput = input.newsSentiment !== undefined
      && (!input.newsSentiment || typeof input.newsSentiment !== 'object'
        || !isFiniteNumber((input.newsSentiment as Record<string, unknown>).score)
        || Number((input.newsSentiment as Record<string, unknown>).score) < -1
        || Number((input.newsSentiment as Record<string, unknown>).score) > 1);
    if (invalidNumericInput || unsafeMarketInput || unsafeNewsInput) {
      return res.status(200).json({
        signal: 'NO_TRADE', confidence: 0,
        confidenceCalibrationNote: 'AI confidence is an uncalibrated advisory score, not a probability of profit.',
        reasoning: 'Server-side validation rejected missing, invalid, or stale market inputs. No actionable AI signal is permitted.',
        strategy: 'SERVER_INPUT_VALIDATION_HALT',
        risk_flags: ['SERVER_INPUT_VALIDATION_HALT'],
        required_checks: ['Refresh and validate market/indicator telemetry before any AI advisory decision is considered.'],
        generatedAt: Date.now(), modelIdentifier: 'GEMINI-2.5-FLASH-SERVER',
        featuresUsed: { price: 0, regime: 'UNKNOWN', rsi: 0, trend: 'UNKNOWN', volatilityAtr: 0, volumeCondition: 'UNKNOWN' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      'You are the advisory analysis layer of QuantPulse. Return JSON only.',
      'You NEVER authorize, submit, route, or execute an order. A deterministic risk engine remains the sole execution gate.',
      'Do not claim certainty or probability of profit. Treat confidence as uncalibrated pattern affinity.',
      'Use only the supplied market/indicator/news data. If data is missing, stale, contradictory, or unsafe, return NO_TRADE with confidence 0.',
      'Required JSON keys: signal, confidence, reasoning, strategy, risk_flags, required_checks.',
      JSON.stringify(input),
    ].join('\\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const responseText = response.text ?? '{}';
    if (new TextEncoder().encode(responseText).byteLength > MAX_AI_RESPONSE_BYTES) throw new Error('AI response is too large.');
    const parsed = JSON.parse(responseText);
    const decision = validateDecision(parsed);
    return res.status(200).json({
      signal: decision.signal,
      confidence: decision.confidence,
      confidenceCalibrationNote: 'AI confidence is an uncalibrated advisory score, not a probability of profit.',
      reasoning: decision.reasoning,
      strategy: decision.strategy,
      risk_flags: decision.risk_flags,
      required_checks: decision.required_checks,
      generatedAt: Date.now(),
      modelIdentifier: 'GEMINI-2.5-FLASH-SERVER',
      featuresUsed: {
        price: isFiniteNumber(input.currentPrice) ? input.currentPrice : 0,
        regime: String(input.indicators?.marketRegime ?? 'UNKNOWN'),
        rsi: isFiniteNumber(input.indicators?.rsi14) ? input.indicators.rsi14 : 0,
        trend: 'AI_ANALYZED',
        volatilityAtr: isFiniteNumber(input.indicators?.atr14) ? input.indicators.atr14 : 0,
        volumeCondition: 'AI_ANALYZED',
      },
    });
  } catch {
    return res.status(502).json({ error: 'Real AI request failed safely. No trading action was authorized or executed.' });
  }
}
