import React from 'react';
import { Briefcase, MapPin, ExternalLink, Sparkles, CheckCircle2, Rocket, DollarSign, Calendar, Info, ChevronDown, ChevronUp, Users, Building2 } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface JobCardProps {
  job: any;
  userProfile?: any;
  onApply: (id: string) => void;
  onSkip?: (id: string) => void;
}

function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/\*{2,}/g, "") // Remove markdown **
    .replace(/^["'\s]+|["'\s]+$/g, "") // Remove outer quotes/whitespace
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function cleanJobTitle(title: string, company: string): string {
  let cleaned = cleanText(title);
  if (company) {
    const cleanComp = cleanText(company).toLowerCase();
    const suffixPatterns = [
      new RegExp(`\\s+(at|for|with|\\-|\\|)\\s+${cleanComp}.*`, 'i'),
      new RegExp(`\\s+${cleanComp}\\s+Careers.*`, 'i')
    ];
    for (const pattern of suffixPatterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
  }
  return cleaned;
}

export function JobCard({ job, onApply, userProfile }: JobCardProps) {
  const isPreparing = job.status === 'preparing';
  const isApplied = job.status === 'applied';
  const isAutoPilot = job.isAutoPilot;
  const [showSalaryTooltip, setShowSalaryTooltip] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);

  const displayTitle = cleanJobTitle(job.title, job.company);
  const displayCompany = cleanText(job.company);
  const displayLocation = cleanText(job.location || 'Remote');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-[var(--bg-surface)] border rounded-2xl p-6 transition-all group relative flex flex-col h-full",
        isAutoPilot 
          ? "border-blue-400 shadow-[0_8px_30px_rgb(59,130,246,0.12)] ring-2 ring-blue-500/10 bg-gradient-to-b from-blue-50/20 to-[var(--bg-surface)]" 
          : "border-[var(--border-color)] hover:border-[var(--accent-blue)]"
      )}
    >
      {isAutoPilot && (
        <div className="absolute -top-3 -right-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg shadow-blue-500/20 z-10 tracking-widest">
           <Sparkles size={12} className="animate-pulse" />
           AUTOPILOT
        </div>
      )}
      
      <div className="flex flex-col xl:flex-row items-start justify-between gap-4 w-full">
        <div className="flex items-start gap-4 flex-1 min-w-0 w-full">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl flex items-center justify-center text-slate-400 shrink-0 group-hover:bg-blue-50 group-hover:text-[var(--accent-blue)] transition-colors mt-0.5">
            <Briefcase className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-[var(--text-primary)] break-words whitespace-normal tracking-tight" title={displayTitle}>
              {displayTitle}
            </h3>
            <div className="flex flex-col gap-1.5 mt-1">
               <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-sm font-semibold text-[var(--text-secondary)] truncate">{displayCompany}</span>
                  <span className="text-slate-300 shrink-0">•</span>
                  <span className="text-sm text-slate-400 flex items-center gap-1.5 truncate">
                     <MapPin size={12} className="shrink-0" />
                     <span className="truncate">{displayLocation}</span>
                  </span>
               </div>
               {(job.industry || job.companySize) && (
                 <div className="flex flex-wrap items-center gap-2">
                   {job.industry && (
                     <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-tight">
                       <Building2 size={10} />
                       {job.industry}
                     </span>
                   )}
                   {job.companySize && (
                     <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-tight">
                       <Users size={10} />
                       {job.companySize}
                     </span>
                   )}
                 </div>
               )}
               <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="relative">
                    <span 
                      onMouseEnter={() => setShowSalaryTooltip(true)}
                      onMouseLeave={() => setShowSalaryTooltip(false)}
                      className={cn(
                        "text-[11px] font-bold flex items-center gap-1.5 cursor-help whitespace-nowrap",
                        job.salary ? "text-green-600" : "text-slate-400"
                      )}
                    >
                      <DollarSign size={12} />
                      {job.salary || 'Not Specified'}
                    </span>
                    <AnimatePresence>
                      {showSalaryTooltip && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 5, scale: 0.95 }}
                          className="absolute bottom-full left-0 mb-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] rounded-lg shadow-xl w-max max-w-[200px] z-20 pointer-events-none"
                        >
                          <div className="font-bold border-b border-white/10 pb-1 mb-1">Salary Insight</div>
                          <p className="opacity-80 leading-snug break-words">
                            {job.salary 
                              ? `This role is offering ${job.salary}. Matching against your preference of ${userProfile?.preferences?.minSalary || 'any'}.`
                              : "Compensation details weren't explicitly found in the posting. AI suggests verifying during the first screen."}
                          </p>
                          <div className="absolute top-full left-4 border-8 border-transparent border-t-slate-900" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar size={12} />
                    {formatDate(job.postedDate || job.createdAt)}
                  </span>
               </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between xl:justify-end gap-3 sm:gap-4 w-full xl:w-auto mt-4 xl:mt-0">
           {job.matchScore && (
              <div className="flex flex-row sm:flex-col items-center sm:items-start xl:items-end justify-between xl:mr-2 shrink-0">
                 <div className="text-[10px] font-bold text-[var(--accent-blue)] uppercase tracking-wider">Match Score</div>
                 <div className="text-lg font-bold text-[var(--text-primary)] leading-tight">{Math.round(job.matchScore)}%</div>
              </div>
           )}
           <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap justify-end w-full sm:w-auto mt-2 sm:mt-0">
             <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex flex-1 sm:flex-none justify-center items-center gap-1 px-3 py-2 text-[11px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all uppercase tracking-wider border border-slate-200 sm:border-transparent hover:border-blue-100"
             >
                <span className="hidden xs:inline">{isExpanded ? 'Hide' : 'View'}</span>
                <Info size={14} className="xs:hidden" />
                <span className="hidden sm:inline">{isExpanded ? 'Hide Details' : 'View Details'}</span>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
             </button>
             <button
                onClick={() => onApply(job.id)}
              disabled={isPreparing && !isAutoPilot}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-[13px] sm:text-sm font-bold transition-all flex items-center gap-1.5 justify-center flex-nowrap shrink-0",
                isApplied 
                   ? "bg-green-50 text-green-700 border border-green-200" 
                   : (isPreparing && !isAutoPilot)
                   ? "bg-slate-50 text-slate-400 border border-slate-100 cursor-not-allowed"
                   : isAutoPilot && isPreparing
                   ? "bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                   : "bg-slate-50 text-[var(--text-primary)] border border-slate-200 hover:bg-[var(--accent-blue)] hover:text-white hover:border-[var(--accent-blue)]"
              )}
            >
              {isApplied ? (
                <>
                   <CheckCircle2 size={14} />
                   <span className="hidden sm:inline">Applied</span>
                   <span className="sm:hidden">Done</span>
                </>
              ) : (isPreparing && !isAutoPilot) ? (
                <>
                   <Sparkles size={14} className="animate-pulse" />
                   <span>Prep...</span>
                </>
              ) : (isPreparing && isAutoPilot) ? (
                <>
                   <Rocket size={14} />
                   <span>Finish & Apply</span>
                </>
              ) : (
                <>
                   <span>Apply</span>
                   <ExternalLink size={14} />
                </>
              )}
           </button>
           </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        {job.jobType && (
          <span className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-bold uppercase tracking-tight">
            {job.jobType}
          </span>
        )}
        {job.technologies?.map((tech: string, i: number) => (
          <span key={i} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-bold uppercase tracking-tight border border-blue-100">
            {tech}
          </span>
        ))}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
              <h4 className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2">Detailed Role Overview</h4>
              <div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-3 whitespace-pre-line break-words">
                {job.fullDescription || job.description}
              </div>
              <div className="mt-4 flex items-center gap-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100/50">
                <Sparkles size={14} className="text-blue-600" />
                <p className="text-[10px] text-blue-800 font-medium">
                  This summary is synthesized by Gemini 1.5 Flash based on real-time web parsing.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isAutoPilot && (
        <div className="mt-5 px-4 py-2 bg-blue-600/5 border border-blue-500/20 rounded-xl flex items-center justify-between">
           <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Managed by AutoPilot</span>
           </div>
           <span className="text-[10px] font-medium text-blue-600/60 italic">Autonomous Workflow Active</span>
        </div>
      )}

      <div className="mt-auto pt-5">
        <div className="p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-color)]">
          <div className="flex items-center gap-2 mb-2">
            <Info size={14} className="text-blue-600" />
            <span className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider">AI Matching Intel</span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed italic">
            "{job.matchReason}"
          </p>
        </div>
      </div>
    </motion.div>
  );
}
