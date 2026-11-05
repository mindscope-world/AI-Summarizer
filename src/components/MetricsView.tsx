import React, {useEffect, useMemo, useState} from 'react';
import {Award, BarChart3, Clock, FlaskConical, MessageSquareText, ShieldCheck, Star, Users} from 'lucide-react';
import benchmarkData from '../data/benchmark.json';
import type {DocumentSummary, FeedbackAggregate, FeedbackEntry} from '../types';
import type {UserRole} from '../lib/auth';
import {formatDuration} from '../lib/insights';
import {averageBy, ratingSummary, usageMetrics, type GroupAverage, type RatingDimension} from '../lib/metrics';

/** What `npm run eval` writes; `{documents: 0}` until someone has run it on a real gold set. */
interface Benchmark {
  documents: number;
  generatedAt?: string;
  model?: string;
  mode?: string;
  length?: string;
  rouge1?: number;
  rouge2?: number;
  rougeL?: number;
}

interface MetricsViewProps {
  documents: DocumentSummary[];
  /** The signed-in student's own ratings. */
  feedback: {entries: FeedbackEntry[]; status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null};
  role: UserRole;
  /** Faculty only: averages over everyone's ratings (null if the account is not faculty). */
  loadAggregates?: () => Promise<FeedbackAggregate[] | null>;
  /** Overridable for tests; defaults to the committed benchmark file. */
  benchmark?: Benchmark;
}

const DIMENSIONS: {id: RatingDimension; label: string}[] = [
  {id: 'model', label: 'Model'},
  {id: 'mode', label: 'Mode'},
  {id: 'length', label: 'Length'},
  {id: 'language', label: 'Language'},
  {id: 'examples', label: 'Examples in prompt'},
];

const stars = (n: number) => n.toFixed(1);

const Stat: React.FC<{label: string; value: string; note?: string}> = ({label, value, note}) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
    <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{value}</div>
    {note && <div className="text-[10px] text-slate-400 mt-0.5">{note}</div>}
  </div>
);

const Section: React.FC<{icon: React.ReactNode; title: string; children: React.ReactNode; note?: string}> = ({icon, title, children, note}) => (
  <section className="bg-white rounded-3xl p-5 lg:p-6 border border-slate-200/80 shadow-xs space-y-3">
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
    </div>
    {note && <p className="text-[11px] text-slate-500">{note}</p>}
    {children}
  </section>
);

const GroupTable: React.FC<{title: string; rows: GroupAverage[]}> = ({title, rows}) => (
  <div>
    <h3 className="text-[11px] font-semibold text-slate-500 mb-1">{title}</h3>
    <table className="w-full text-left text-xs">
      <thead className="sr-only">
        <tr>
          <th>{title}</th>
          <th>Ratings</th>
          <th>Average</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {rows.map((r) => (
          <tr key={r.value}>
            <td className="py-1.5 pr-2 break-all">{r.value}</td>
            <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">{r.responses} rating{r.responses === 1 ? '' : 's'}</td>
            <td className="py-1.5 font-semibold text-right whitespace-nowrap">{stars(r.average)} / 5</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const MetricsView: React.FC<MetricsViewProps> = ({documents, feedback, role, loadAggregates, benchmark = benchmarkData as Benchmark}) => {
  const usage = useMemo(() => usageMetrics(documents), [documents]);
  const ratings = useMemo(() => ratingSummary(feedback.entries), [feedback.entries]);
  const withComments = useMemo(() => feedback.entries.filter((e) => e.comment.trim()).slice(0, 5), [feedback.entries]);

  const [aggregates, setAggregates] = useState<FeedbackAggregate[] | null | 'loading' | 'error'>('loading');
  useEffect(() => {
    if (role !== 'faculty' || !loadAggregates) return;
    let cancelled = false;
    setAggregates('loading');
    loadAggregates().then(
      (rows) => !cancelled && setAggregates(rows),
      () => !cancelled && setAggregates('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [role, loadAggregates]);

  const maxBucket = Math.max(1, ...ratings.distribution);
  const hasBenchmark = benchmark.documents > 0 && benchmark.rouge1 !== undefined;

  return (
    <div className="flex-1 max-w-6xl mx-auto space-y-6 pb-16 text-xs">
      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-xs">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[11px] mb-2">
          <Award className="w-3.5 h-3.5" />
          <span>Quality and usage</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">How well is the summarizer working?</h1>
        <p className="text-slate-500 max-w-3xl">
          These numbers come from your own summaries and ratings, and from an offline benchmark. Nothing on this page is a fixed figure: it changes when your data does.
        </p>
      </div>

      {/* Usage, from the student's own documents */}
      <Section icon={<Clock className="w-4 h-4 text-emerald-600" />} title="Your summaries" note="Measured from the summaries in your account.">
        {usage.documentCount === 0 ? (
          <p className="text-slate-500">You have no summaries yet. Create one to see figures here.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Summaries" value={String(usage.documentCount)} />
              <Stat
                label="Average length reduction"
                value={usage.compressionPercent === null ? '-' : `${usage.compressionPercent}%`}
                note={usage.measuredCount ? `over ${usage.measuredCount} with recorded word counts` : 'no word counts recorded'}
              />
              <Stat
                label="Average processing time"
                value={usage.averageSeconds === null ? '-' : `${usage.averageSeconds.toFixed(1)}s`}
                note={usage.slowestSeconds === null ? undefined : `slowest ${usage.slowestSeconds.toFixed(1)}s, ${usage.timedCount} timed`}
              />
              <Stat
                label="Estimated reading time saved"
                value={usage.minutesSaved === null ? '-' : formatDuration(usage.minutesSaved)}
                note="at 200 words per minute"
              />
            </div>
            {usage.byModel.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Made with: {usage.byModel.map((m) => `${m.model} (${m.count})`).join(', ')}.
              </p>
            )}
          </>
        )}
      </Section>

      {/* The student's own ratings */}
      <Section
        icon={<Star className="w-4 h-4 text-amber-500" />}
        title="Your ratings"
        note="Rate a summary from the Journal (below the summary). Ratings are private to your account."
      >
        {feedback.status === 'loading' && <p role="status" className="text-slate-500">Loading your ratings...</p>}
        {feedback.status === 'error' && <p role="alert" className="text-red-700">{feedback.error ?? 'Could not load your ratings.'}</p>}
        {feedback.status === 'ready' && ratings.count === 0 && <p className="text-slate-500">You have not rated a summary yet.</p>}
        {ratings.count > 0 && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-4 items-center">
              <div>
                <div className="text-3xl font-extrabold text-slate-900">{stars(ratings.average ?? 0)} <span className="text-base font-semibold text-slate-400">/ 5</span></div>
                <div className="text-[11px] text-slate-500">
                  {ratings.count} rating{ratings.count === 1 ? '' : 's'}; {ratings.consentedCount} allowed as examples
                </div>
              </div>
              <div className="space-y-1" role="img" aria-label={`Ratings: ${ratings.distribution.map((n, i) => `${n} of ${i + 1} stars`).join(', ')}`}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="w-6 text-slate-500">{n} ★</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div className="bg-amber-400 h-full rounded-full" style={{width: `${(ratings.distribution[n - 1] / maxBucket) * 100}%`}} />
                    </div>
                    <span className="w-6 text-right text-slate-500">{ratings.distribution[n - 1]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 pt-2">
              {DIMENSIONS.map((d) => {
                const rows = averageBy(feedback.entries, d.id);
                return rows.length ? <GroupTable key={d.id} title={d.label} rows={rows} /> : null;
              })}
            </div>
            {usage.withExamples > 0 && (
              <p className="text-[11px] text-slate-500">
                {usage.withExamples} of your summaries used your own rated summaries as style examples. Compare the two "Examples in prompt" rows above to see whether it helps; with few ratings the difference is mostly noise.
              </p>
            )}

            {withComments.length > 0 && (
              <div className="pt-2">
                <h3 className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                  <MessageSquareText className="w-3.5 h-3.5" /> Your recent comments
                </h3>
                <ul className="space-y-1.5">
                  {withComments.map((e) => (
                    <li key={e.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
                      <span className="font-semibold">{e.rating} ★</span> {e.comment}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Faculty: everyone's ratings, grouped */}
      {role === 'faculty' && (
        <Section
          icon={<Users className="w-4 h-4 text-purple-600" />}
          title="Across all users (faculty)"
          note="Averages over every user's ratings. Groups with fewer than 3 ratings are hidden so a figure never describes one person. You cannot see anyone's comments or summaries."
        >
          {aggregates === 'loading' && <p role="status" className="text-slate-500">Loading...</p>}
          {aggregates === 'error' && <p role="alert" className="text-red-700">Could not load the report. Try again later.</p>}
          {aggregates === null && <p className="text-slate-500">This account cannot view the report.</p>}
          {Array.isArray(aggregates) && aggregates.length === 0 && <p className="text-slate-500">Not enough ratings yet: a group needs at least 3.</p>}
          {Array.isArray(aggregates) && aggregates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
              {(['all', 'model', 'mode', 'length', 'language', 'role', 'examples'] as const).map((dim) => {
                const rows = aggregates.filter((a) => a.dimension === dim).map((a) => ({value: a.value, responses: a.responses, average: a.averageRating}));
                return rows.length ? <GroupTable key={dim} title={dim === 'all' ? 'Everyone' : dim[0].toUpperCase() + dim.slice(1)} rows={rows} /> : null;
              })}
            </div>
          )}
        </Section>
      )}

      {/* The only place ROUGE appears: an offline benchmark, never a per-summary figure */}
      <Section
        icon={<FlaskConical className="w-4 h-4 text-blue-600" />}
        title="Offline benchmark (ROUGE)"
        note="ROUGE compares a generated summary with one a person wrote. It is measured once, offline, on a fixed set of reference documents. It says nothing about any individual summary you make."
      >
        {hasBenchmark ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat label="ROUGE-1 (word overlap)" value={benchmark.rouge1!.toFixed(3)} />
              <Stat label="ROUGE-2 (word pairs)" value={(benchmark.rouge2 ?? 0).toFixed(3)} />
              <Stat label="ROUGE-L (word order)" value={(benchmark.rougeL ?? 0).toFixed(3)} />
            </div>
            <p className="text-[11px] text-slate-500">
              Benchmark on {benchmark.documents} reference document{benchmark.documents === 1 ? '' : 's'}
              {benchmark.mode ? `, ${benchmark.mode}` : ''}{benchmark.length ? `, ${benchmark.length}` : ''}{benchmark.model ? `, ${benchmark.model}` : ''}
              {benchmark.generatedAt ? `; run on ${new Date(benchmark.generatedAt).toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})}` : ''}.
              F1 scores, no stemming; they differ a little from other ROUGE packages.
            </p>
          </>
        ) : (
          <p className="text-slate-500 flex items-start gap-2">
            <BarChart3 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>No benchmark has been run yet. An administrator adds human-written reference summaries and runs <code className="font-mono">npm run eval</code>; the results appear here.</span>
          </p>
        )}
      </Section>

      <Section icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />} title="How your data is used">
        <ul className="list-disc pl-4 space-y-1 text-slate-600">
          <li>To make a summary, the text of your document is sent to an AI service (Groq) that runs open-weights models. Do not summarise material you are not allowed to share with a third party.</li>
          <li>Your summaries, notes, comments and ratings are stored in your account and are visible only to you.</li>
          <li>Ratings you mark "use as an example" may be shown, in part, to the AI when you summarise something in the same subject. They are not shared with other students.</li>
          <li>The AI is not retrained on your data.</li>
        </ul>
      </Section>
    </div>
  );
};
