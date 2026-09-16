import React, { useState } from 'react';
import { VERIFIED_NEWS_FEED, NewsEventItem } from '../../engines/newsEventEngine';
import { Newspaper, ExternalLink, Calendar, CheckCircle2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const NewsEventView: React.FC = () => {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  const categories = ['ALL', 'CENTRAL_BANK', 'REGULATORY', 'EARNINGS', 'MACRO_ECONOMY'];

  const filteredItems = filterCategory === 'ALL'
    ? VERIFIED_NEWS_FEED
    : VERIFIED_NEWS_FEED.filter((item) => item.category === filterCategory);

  const getSentimentBadge = (score: number) => {
    if (score > 0.15) {
      return (
        <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] font-mono">
          <TrendingUp className="w-3 h-3" />
          <span>+{score.toFixed(2)} Bullish</span>
        </span>
      );
    } else if (score < -0.15) {
      return (
        <span className="flex items-center space-x-1 text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded text-[11px] font-mono">
          <TrendingDown className="w-3 h-3" />
          <span>{score.toFixed(2)} Bearish</span>
        </span>
      );
    }
    return (
      <span className="flex items-center space-x-1 text-slate-400 bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono">
        <Minus className="w-3 h-3" />
        <span>{score.toFixed(2)} Neutral</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Description & Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Newspaper className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">Verified Financial News & Macro Event Stream</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Timestamped macroeconomic and corporate events verified by official regulatory and exchange press archives.
          </p>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center space-x-1.5 font-mono text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                filterCategory === cat
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Feed List */}
      <div className="space-y-3">
        {filteredItems.map((item: NewsEventItem) => (
          <div
            key={item.id}
            className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-bold text-[10px]">
                  {item.category}
                </span>
                {item.symbolTarget && (
                  <span className="px-2 py-0.5 bg-blue-950/60 border border-blue-600/40 rounded text-blue-300 font-bold text-[10px]">
                    ${item.symbolTarget}
                  </span>
                )}
                <span className="text-slate-400 flex items-center space-x-1 text-[11px]">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </span>
              </div>
              <div className="flex items-center space-x-3">
                {getSentimentBadge(item.sentimentScore)}
                <span className="text-[10px] text-slate-400 font-mono">Impact: {item.impactAssessment}</span>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-100">{item.headline}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{item.summary}</p>

            <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-[11px] font-mono text-slate-400">
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Source: <strong className="text-slate-300">{item.source}</strong></span>
              </div>
              <a
                href={item.sourceUrlVerification}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 hover:underline"
              >
                <span>Audit Origin</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
