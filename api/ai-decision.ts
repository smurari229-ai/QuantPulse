import type { VercelRequest, VercelResponse } from '@vercel/node';
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
  if (typeof d.strategy !== 'string' || d.strategy.length > 200) throw new Error('AI strategy is invalid.');
  if (!Array.isArray(d.risk_flags) || !d.risk_flags.every((x) => typeof x === 'string')) throw new Error('AI risk flags are invalid.');
  if (!Array.isArray(d.required_checks) || !d.required_checks.every((x) => typeof x === 'string')) throw new Error('AI required checks are invalid.');
  return d;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Real AI is not configured. Add GEMINI_API_KEY as a server-side environment variable.' });

  try {
    const body = req.body ?? {};
    const input = body.input;
    if (!input || typeof input !== 'object') return res.status(400).json({ error: 'Missing AI feature input.' });

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

    const parsed = JSON.parse(response.text ?? '{}');
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI provider request failed.';
    return res.status(502).json({ error: `Real AI request failed safely: ${message}` });
  }
}
