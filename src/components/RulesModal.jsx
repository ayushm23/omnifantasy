import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

export default function RulesModal({ show, onClose }) {
  const [expanded, setExpanded] = useState({ basic: false, scoring: false, moreInfo: false });
  if (!show) return null;
  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xl flex flex-col overflow-y-auto shadow-2xl max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between sticky top-0 z-10 rounded-t-2xl">
          <h3 className="text-xl font-bold text-white">📖 How to Play</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700/50 rounded"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">

          {/* Basics */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle('basic')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
            >
              <h4 className="font-bold text-white">📋 Basics</h4>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform ${expanded.basic ? 'rotate-180' : ''}`}
              />
            </button>
            {expanded.basic && (
              <div className="px-4 py-4 border-t border-slate-700/50">
                <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                  <div><span className="font-semibold text-white">Snake-style draft:</span> Select teams from across various sports leagues, not individual players.</div>
                  <div><span className="font-semibold text-white">Draft-only format:</span> Once the draft is complete, sit back and watch your teams compete for championships throughout the year.</div>
                  <div><span className="font-semibold text-white">Customizable leagues:</span> Choose which sports to include. More leagues = fuller calendar and longer draft.</div>
                  <div><span className="font-semibold text-white">Required picks:</span> Every drafter must pick at least one team from each sport in the league.</div>
                  <div><span className="font-semibold text-white">FLEX picks:</span> Additional picks let you select second or third teams from whichever sports you prefer.</div>
                  <div><span className="font-semibold text-white">Year-long contest:</span> A slow burn over a full calendar year. You'll have skin in the game each time a new sport's playoffs roll around!</div>
                  <div><span className="font-semibold text-white">Winner:</span> At year's end, whoever's roster performed best across all sports wins!</div>
                </div>
              </div>
            )}
          </div>

          {/* Scoring */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle('scoring')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
            >
              <h4 className="font-bold text-white">🎯 Scoring</h4>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform ${expanded.scoring ? 'rotate-180' : ''}`}
              />
            </button>
            {expanded.scoring && (
              <div className="px-4 py-4 border-t border-slate-700/50">
                <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                  <div>
                    <div className="font-semibold text-white mb-2">Universal Scoring (All Sports):</div>
                    <div className="space-y-1 ml-2">
                      <div className="text-yellow-400 font-bold">🏆 80 points - Champion</div>
                      <div className="text-gray-400 font-bold">🥈 50 points - Runner-up</div>
                      <div className="text-orange-400 font-bold">🥉 30 points - Semifinalists (2 teams)</div>
                      <div className="text-blue-400 font-bold">📊 20 points - Quarterfinalists (4 teams)</div>
                    </div>
                    <div className="text-xs mt-2 text-slate-400">Top 8 finishers in every sport earn points. Every pick can earn up to 80 points.</div>
                  </div>
                  <div><span className="font-semibold text-white">Equal Weight:</span> All sports weighted the same. 80 points for the Super Bowl = 80 for Stanley Cup = 80 for World Series.</div>
                  <div><span className="font-semibold text-white">Undrafted Teams:</span> If an undrafted team wins or places, they "steal" those points - nobody receives them.</div>
                  <div className="pt-2 border-t border-slate-600/30">
                    <div className="font-semibold text-white mb-1">Special Scoring Rules:</div>
                    <div className="space-y-2 ml-2 text-xs">
                      <div><span className="text-blue-400 font-semibold">Golf:</span> Aggregate score over 4 majors (Masters, PGA, US Open, Open Championship). Tournament finishes convert to "golf points" to determine top 8.</div>
                      <div><span className="text-blue-400 font-semibold">Tennis:</span> Aggregate over 4 majors (French, Wimbledon, US Open, Australian). "Tennis points" from tournament finishes determine top 8.</div>
                      <div><span className="text-blue-400 font-semibold">F1:</span> Season final standings determine points. 3rd/4th earn 30 as "semifinalists", 5th-8th earn 20.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* More Info */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle('moreInfo')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
            >
              <h4 className="font-bold text-white">ℹ️ More Info</h4>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform ${expanded.moreInfo ? 'rotate-180' : ''}`}
              />
            </button>
            {expanded.moreInfo && (
              <div className="px-4 py-4 border-t border-slate-700/50">
                <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                  <div><span className="font-semibold text-white">Expected Points:</span> Listed on league pages (when available) are from simulations using futures odds. A guide for first-timers to compare odds across sports. Experienced players should do their own research.</div>
                  <div><span className="font-semibold text-white">Required Picks:</span> Each drafter must select at least one team from each sport/league in the contest.</div>
                  <div><span className="font-semibold text-white">FLEX Picks:</span> Can be made in any sport. They don't prevent others from meeting their requirement to pick one team per sport.</div>
                  <div><span className="font-semibold text-white">Stolen Points:</span> Undrafted teams finishing in the top 8 steal points from everyone. The next highest drafted team does NOT move up - they get points for their actual finish (e.g., if undrafted team wins, runner-up still gets 50 points, not 80).</div>
                  <div><span className="font-semibold text-white">Tiebreaker:</span> Final event to be decided breaks ties, then second-to-last, and so on. For typical February drafts, NFL is the tiebreaker sport.</div>
                  <div className="text-xs pt-2 border-t border-slate-600/30">
                    <span className="font-semibold text-white">Commissioner:</span> League creator has admin control and is the only one who can start the draft.
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
